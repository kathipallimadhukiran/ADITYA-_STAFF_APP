import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform, AppState, NativeEventEmitter, NativeModules, Alert, Linking, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { firebase as firebaseInstance, getAuth, db } from './Firebase/firebaseConfig';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { saveLocationToMongo, saveLocationOffline, syncOfflineLocations, startOfflineSync } from './mongoService';
import { testAPIConnection, API_URL } from '../config/apiConfig';
import * as BackgroundFetch from 'expo-background-fetch';
import * as Application from 'expo-application';
// Constants for task names
const LOCATION_TASK_NAME = 'background-location-task';
const RECOVERY_TASK_NAME = 'location-recovery-task';
const BACKGROUND_TASK_NAME = 'background-location-update';
const KILLED_STATE_KEY = '@app_killed_state';
const LAST_TRACKING_TIME_KEY = '@last_tracking_time';
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_ATTEMPT_INTERVAL = 60000; // 1 minute

// Track registered tasks and auth state
const registeredTasks = new Set();
let isAuthStateClearing = false;

// Add these constants at the top with other constants
const AUTH_KEYS = [
  USER_AUTH_KEY,
  TRACKING_ENABLED_KEY,
  TRACKING_STATE_KEY,
  LOCATION_PERMISSION_STATUS,
  SETTINGS_CACHE_KEY,
  USER_DATA_CACHE_KEY,
  '@location_tracking_state',
  'lastLocationError',
  KILLED_STATE_KEY,
  LAST_TRACKING_TIME_KEY
];

// Add these helper functions at the top of the file
const USER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const USER_CACHE_KEY = '@user_auth_cache';

// Add this constant at the top with other constants
const RESTART_INTERVAL = 60000; // 1 minute

// Add these constants at the top
const KEEP_ALIVE_NOTIFICATION_ID = "location_tracking_alive";
const KEEP_ALIVE_CHANNEL_ID = "location_tracking_keep_alive";

// Add these constants at the top
const FORCE_STOP_KEY = '@force_stop_state';
const BACKGROUND_FETCH_INTERVAL = 60000; // 1 minute

// Optimized constants for better performance
const SETTINGS_REFRESH_INTERVAL = 300000; // 5 minutes instead of 20 seconds
const WORKING_HOURS_CHECK_INTERVAL = 60000; // 1 minute instead of every location update
const LOCATION_CHECK_INTERVAL = 5000; // 5 seconds instead of 1 second
const NETWORK_RETRY_DELAY = 10000; // 10 seconds between network retries

// Add state tracking for optimization
let lastWorkingHoursResult = null;
let isNetworkRetrying = false;
let networkRetryCount = 0;
const MAX_NETWORK_RETRIES = 3;

// Add time formatting helper function at the top with other utility functions
const formatDateTime = (date) => {
  try {
    // Convert to IST by adding 5 hours and 30 minutes
    const istDate = new Date(date.getTime() + (5.5 * 60 * 60 * 1000));
    
    const pad = (num) => String(num).padStart(2, '0');
    
    const day = pad(istDate.getUTCDate());
    const month = pad(istDate.getUTCMonth() + 1);
    const year = istDate.getUTCFullYear();
    const hours = pad(istDate.getUTCHours());
    const minutes = pad(istDate.getUTCMinutes());
    const seconds = pad(istDate.getUTCSeconds());

    return `${day}-${month}-${year}, ${hours}:${minutes}:${seconds} IST`;
  } catch (error) {
    console.error('[Location Service] Error formatting date to IST:', error);
    // Fallback to basic format if there's an error
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} IST`;
  }
};

// Function to safely define a task with state tracking
const safelyDefineTask = (taskName, taskFunction) => {
  try {
    // Check if we've already registered this task in our session
    if (registeredTasks.has(taskName)) {
      return;
    }

    // Check if task is defined in TaskManager
    if (TaskManager.isTaskDefined(taskName)) {
      // If it's defined but not in our set, just add it to our set
      registeredTasks.add(taskName);
      return;
    }

    // Define the task
    TaskManager.defineTask(taskName, taskFunction);
    registeredTasks.add(taskName);
    console.log(`[Location Service] Task ${taskName} defined successfully`);
  } catch (error) {
    console.error(`[Location Service] Error defining task ${taskName}:`, error);
  }
};

// Function to unregister all tasks
const unregisterAllTasks = async () => {
  try {
    // Only unregister if we have registered tasks
    if (registeredTasks.size > 0) {
      await TaskManager.unregisterAllTasksAsync();
      registeredTasks.clear();
      console.log('[Location Service] All tasks unregistered successfully');
    }
  } catch (error) {
    console.error('[Location Service] Error unregistering tasks:', error);
  }
};

// Define background tasks safely
safelyDefineTask(LOCATION_TASK_NAME, async ({ data: { locations }, error }) => {
  if (error) {
    console.error('[Location Service] Background location task error:', error);
    return;
  }

  if (locations && locations.length > 0) {
    try {
      await getAndSaveLocation();
    } catch (error) {
      console.error('[Location Service] Error in background location task:', error);
    }
  }
});

safelyDefineTask(RECOVERY_TASK_NAME, async () => {
  try {
    await getAndSaveLocation();
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (!isTracking) {
      await startLocationTracking();
    }
    startForcedUpdates();
    return true;
  } catch (error) {
    console.error('[Location Service] Recovery task error:', error);
    return false;
  }
});

safelyDefineTask(BACKGROUND_TASK_NAME, async () => {
  try {
    await getAndSaveLocation();
    return true;
  } catch (error) {
    console.error('[Location Service] Background task error:', error);
    return false;
  }
});

// Function to create notification channel for background location updates
const createNotificationChannel = async () => {
  try {
    if (Platform.OS === 'android') {
      // Create the main location tracking channel
      await Notifications.setNotificationChannelAsync('location-tracking', {
        name: 'Location Tracking',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: false,
        enableLights: true,
        lightColor: '#4CAF50',
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        description: 'Required for tracking your location for attendance',
        bypassDnd: true,
        showBadge: true,
        sticky: true
      });

      // Create keep-alive channel
      await Notifications.setNotificationChannelAsync(KEEP_ALIVE_CHANNEL_ID, {
        name: 'Keep Alive Service',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: false,
        enableLights: false,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        description: 'Keeps location tracking active',
        bypassDnd: true,
        showBadge: false,
        sticky: true
      });

      // Show persistent notification
      await Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: false,
          shouldPlaySound: false,
          shouldSetBadge: false,
          priority: 'high'
        }),
      });

      // Schedule the keep-alive notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Location Tracking Active",
          body: "Your location is being tracked for attendance",
          sticky: true,
          ongoing: true,
          color: '#4CAF50',
          priority: 'high',
        },
        trigger: null,
        identifier: KEEP_ALIVE_NOTIFICATION_ID
      });
    }
  } catch (error) {
    console.error('[Location Service] Error creating notification channel:', error);
  }
};

// Constants
const LOCATION_UPDATE_INTERVAL = 60000; // 1 minute instead of 20 seconds
const RECOVERY_INTERVAL = 60000; // 1 minute instead of 20 seconds
const LOCATION_DISTANCE_INTERVAL = 0; // Update regardless of distance
const BACKGROUND_UPDATE_INTERVAL = 60000; // 1 minute instead of 20 seconds
const BACKGROUND_DISTANCE_INTERVAL = 0; // Update regardless of distance
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 60000; // 1 minute
const SETTINGS_CACHE_KEY = '@attendance_settings_cache';
const USER_DATA_CACHE_KEY = '@user_data_cache';
const USER_DATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const LOCATION_PERMISSION_STATUS = '@location_permission_status';
const TRACKING_STATE_KEY = '@location_tracking_state';
const BATTERY_OPTIMIZATION_THRESHOLD = 20; // Battery percentage threshold for optimization

// Add new constants for enhanced background tracking
const BACKGROUND_FETCH_TASK_NAME = 'background-fetch';
const MIN_BACKGROUND_FETCH_INTERVAL = 15 * 60; // Minimum 15 minutes as per OS restrictions
const LOCATION_TASK_OPTIONS = {
  accuracy: Location.Accuracy.BestForNavigation,
  distanceInterval: 10, // Update if device moves by 10 meters
  timeInterval: 60000, // Update every 1 minute
  showsBackgroundLocationIndicator: true,
  activityType: Location.ActivityType.Other,
  pausesUpdatesAutomatically: false,
  foregroundService: {
    notificationTitle: "Location Tracking Active",
    notificationBody: "Your location is being tracked for attendance",
    notificationColor: "#4CAF50",
    killServiceOnDestroy: false,
    channelId: "location-tracking",
    enableVibrate: false,
    enableWakeLock: true,
    startForeground: true
  },
  // Android specific options
  android: {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 60000,
    distanceInterval: 10,
    foregroundService: {
      notificationTitle: "Location Tracking Active",
      notificationBody: "Your location is being tracked for attendance",
      notificationColor: "#4CAF50",
      channelId: "location-tracking",
      enableVibrate: false,
      enableWakeLock: true,
      killServiceOnDestroy: false,
      startForeground: true,
      sticky: true
    }
  },
  // iOS specific options
  ios: {
    activityType: Location.ActivityType.OtherNavigation,
    allowsBackgroundLocationUpdates: true,
    showsBackgroundLocationIndicator: true,
    pausesLocationUpdatesAutomatically: false
  }
};

// Track active state
let _isTrackingActive = false;
let lastLocationUpdate = null;
let cachedAuthData = null;
let lastBatteryLevel = 100;
let isInLowPowerMode = false;
let isCheckingTracking = false;
let lastAppState = AppState.currentState;
let lastStateChangeTime = Date.now();
let stateChangeTimeout = null;
let backgroundTaskRegistered = false;
let settingsRefreshInterval = null;
let appStateSubscription = null;
let locationCheckInterval = null;
let isShowingLocationAlert = false;
let recoveryCheckInterval = null;
let workingHoursCheckInterval = null;
let isInitializing = false;
let hasInitialized = false;
let lastInitAttempt = 0;
const INIT_DEBOUNCE = 5000; // 5 seconds debounce for initialization attempts

// Function to safely update tracking state
const setTrackingActive = async (value) => {
  _isTrackingActive = value;
  await AsyncStorage.setItem('isTrackingActive', value ? 'true' : 'false');
};

// Add event emitter for location permission status changes
const createEventEmitter = (nativeModule) => {
  if (!nativeModule) {
    return {
      addListener: () => ({ remove: () => {} }),
      removeAllListeners: () => {},
      emit: () => {}
    };
  }
  return new NativeEventEmitter(nativeModule);
};

// Create event emitters with fallbacks
const locationPermissionEmitter = createEventEmitter(
  NativeModules.LocationServicesModule && {
    ...NativeModules.LocationServicesModule,
    addListener: NativeModules.LocationServicesModule.addListener || (() => ({ remove: () => {} })),
    removeListeners: NativeModules.LocationServicesModule.removeListeners || (() => {})
  }
);

// Add navigation event emitter
const locationPermissionNavigationEmitter = createEventEmitter(
  NativeModules.LocationServicesModule && {
    ...NativeModules.LocationServicesModule,
    addListener: NativeModules.LocationServicesModule.addListener || (() => ({ remove: () => {} })),
    removeListeners: NativeModules.LocationServicesModule.removeListeners || (() => {})
  }
);

// Add a queue for pending navigation actions
let pendingNavigationActions = [];
let isNavigationReady = false;

// Add function to handle navigation readiness
export const setNavigationReady = (ready) => {
  console.log('[Location Service] Setting navigation ready:', ready);
  isNavigationReady = ready;
  if (ready) {
    // Process any pending navigation actions
    while (pendingNavigationActions.length > 0) {
      const action = pendingNavigationActions.shift();
      action();
    }
  }
};

// Add this function to handle app termination
const handleAppTermination = async () => {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      // Save the tracking state
      await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify({
        wasTracking: true,
        timestamp: Date.now()
      }));

      // Ensure the notification is showing
      await createNotificationChannel();
    }
  } catch (error) {
    console.error('[Location Service] Error handling app termination:', error);
  }
};

// Add this function to check and restore tracking
const checkAndRestoreTracking = async () => {
  try {
    const trackingState = await AsyncStorage.getItem(TRACKING_STATE_KEY);
    if (trackingState) {
      const { wasTracking, timestamp } = JSON.parse(trackingState);
      if (wasTracking) {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);
        
        if (!isTracking) {
          console.log('[Location Service] Restoring tracking after termination');
          await startLocationTracking(true);
        }
      }
    }
  } catch (error) {
    console.error('[Location Service] Error restoring tracking:', error);
  }
};

// Update the setupAppStateListener function
const setupAppStateListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
  }
  
  appStateSubscription = AppState.addEventListener('change', async (nextAppState) => {
    try {
      const now = Date.now();
      if (now - lastStateChangeTime < STATE_CHANGE_DEBOUNCE) {
        return;
      }
      lastStateChangeTime = now;

      console.log('[Location Service] App state changed to:', nextAppState);

      // Check working hours first
      const workingHoursCheck = await checkWorkingHours();
      
      if (nextAppState === 'background') {
        if (workingHoursCheck.isWithinWorkingHours) {
          // Handle both kill and force stop cases
          await Promise.all([
            handleAppKilled(),
            handleForceStop()
          ]);
        }
      } else if (nextAppState === 'active') {
        if (workingHoursCheck.isWithinWorkingHours) {
          // Check both kill and force stop states
          const [killedStateStr, forceStopStr] = await Promise.all([
            AsyncStorage.getItem(KILLED_STATE_KEY),
            AsyncStorage.getItem(FORCE_STOP_KEY)
          ]);

          const wasKilled = killedStateStr ? JSON.parse(killedStateStr).wasKilled : false;
          const wasForceStoped = forceStopStr ? JSON.parse(forceStopStr).wasForceStoped : false;

          if (wasKilled || wasForceStoped) {
            await restartTrackingAfterKill();
            // Clear both states
            await Promise.all([
              AsyncStorage.removeItem(KILLED_STATE_KEY),
              AsyncStorage.removeItem(LAST_TRACKING_TIME_KEY),
              AsyncStorage.removeItem(FORCE_STOP_KEY)
            ]);
          }
        } else {
          await stopLocationTracking();
        }
      }

      lastAppState = nextAppState;
    } catch (error) {
      console.error('[Location Service] Error in app state change:', error);
    }
  });
};

const isLocationTrackingEnabled = async () => {
  try {
    const enabled = await AsyncStorage.getItem(TRACKING_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    return false;
  }
};

const saveTrackingState = async (enabled) => {
  try {
    await AsyncStorage.setItem(TRACKING_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (error) {}
};

const cacheAuthData = async () => {
  try {
    const user = firebase.auth().currentUser;
    if (user) {
      const userDoc = await db.collection('users').doc(user.email).get();
      const userData = userDoc.data();
      const authData = {
        email: user.email,
        role: userData?.role,
        timestamp: new Date().toISOString()
      };
      await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(authData));
      cachedAuthData = authData;
    }
  } catch (error) {}
};

const getCachedAuthData = async () => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return null; // Don't require permissions outside working hours
    }

    // Always get current Firebase user first
    const user = firebase.auth().currentUser;
    if (!user?.email) {
      console.log('[Location Service] No Firebase user found');
      return null;
    }

    try {
      // Try to get fresh data from Firestore
      const userDoc = await db.collection('users').doc(user.email).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        const authData = {
          email: user.email,
          role: userData?.role,
          timestamp: new Date().toISOString()
        };
        // Update both in-memory and AsyncStorage cache
        cachedAuthData = authData;
        await AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(authData));
        return authData;
      }
    } catch (error) {
      console.log('[Location Service] Error fetching fresh user data:', error);
      
      // If Firestore fails, try to use cached data
      if (cachedAuthData?.email === user.email) {
        return cachedAuthData;
      }
      
      const data = await AsyncStorage.getItem(USER_AUTH_KEY);
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData?.email === user.email && parsedData?.role) {
            cachedAuthData = parsedData;
            return parsedData;
          }
        } catch (e) {
          console.log('[Location Service] Error parsing cached auth data:', e);
        }
      }
    }
    return null;
  } catch (error) {
    console.log('[Location Service] Error in getCachedAuthData:', error);
    return null;
  }
};

const cacheUserData = async (userData) => {
  try {
    if (!userData || !userData.email || !userData.role) {
      console.log('[Location Service] Invalid user data for caching');
      return false;
    }

    const cacheData = {
      email: userData.email.toLowerCase().trim(),
      role: userData.role.toLowerCase().trim(),
      timestamp: Date.now(),
      // Include additional required fields
      department: userData.department || '',
      id: userData.id || '',
      name: userData.name || '',
      isVerified: userData.isVerified || false
    };

    await AsyncStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify(cacheData));
    console.log('[Location Service] User data cached successfully');
    return true;
  } catch (error) {
    console.error('[Location Service] Error caching user data:', error);
    return false;
  }
};

const getCachedUserData = async () => {
  try {
    const cachedData = await AsyncStorage.getItem(USER_DATA_CACHE_KEY);
    if (!cachedData) return null;

    const userData = JSON.parse(cachedData);
    const age = Date.now() - userData.timestamp;

    if (age > USER_DATA_CACHE_DURATION) {
      console.log('[Location Service] Cached user data expired');
      return null;
    }

    return userData;
  } catch (error) {
    console.error('[Location Service] Error getting cached user data:', error);
    return null;
  }
};

const clearAuthData = async () => {
  if (isAuthStateClearing) {
    console.log('[Location Service] Auth state clearing already in progress');
    return;
  }

  isAuthStateClearing = true;
  console.log('[Location Service] Starting auth state clearing');

  try {
    // First stop location tracking
    try {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        console.log('[Location Service] Location tracking stopped');
      }
    } catch (error) {
      console.log('[Location Service] Error stopping location tracking:', error);
    }

    // Clear all intervals
    [
      forcedUpdateInterval,
      recoveryCheckInterval,
      locationCheckInterval,
      settingsRefreshInterval,
      workingHoursCheckInterval
    ].forEach(interval => {
      if (interval) {
        clearInterval(interval);
      }
    });

    // Reset interval variables
    forcedUpdateInterval = null;
    recoveryCheckInterval = null;
    locationCheckInterval = null;
    settingsRefreshInterval = null;
    workingHoursCheckInterval = null;

    // Clear all tasks
    try {
      await unregisterAllTasks();
      console.log('[Location Service] All tasks unregistered');
    } catch (error) {
      console.log('[Location Service] Error unregistering tasks:', error);
    }

    // Clear all stored data
    try {
      await AsyncStorage.multiRemove(AUTH_KEYS);
      console.log('[Location Service] Auth storage cleared');
    } catch (error) {
      console.log('[Location Service] Error clearing auth storage:', error);
    }

    // Reset state variables
    _isTrackingActive = false;
    lastLocationUpdate = null;
    cachedAuthData = null;
    lastBatteryLevel = 100;
    isInLowPowerMode = false;
    isCheckingTracking = false;
    lastAppState = AppState.currentState;
    lastStateChangeTime = Date.now();
    backgroundTaskRegistered = false;
    hasInitialized = false;
    isInitializing = false;

    if (stateChangeTimeout) {
      clearTimeout(stateChangeTimeout);
      stateChangeTimeout = null;
    }

    // Clear registered tasks set
    registeredTasks.clear();

    console.log('[Location Service] Auth state cleared successfully');
    return true;
  } catch (error) {
    console.error('[Location Service] Error in clearAuthData:', error);
    return false;
  } finally {
    isAuthStateClearing = false;
  }
};

const saveAuthData = async (userData) => {
  try {
    if (!userData?.email || !userData?.role) {
      console.log('[Location Service] Invalid user data for saving');
      return false;
    }
    
    const authData = {
      email: userData.email,
      role: userData.role,
      timestamp: new Date().toISOString()
    };
    
    // Update both in-memory and AsyncStorage cache atomically
    await Promise.all([
      AsyncStorage.setItem(USER_AUTH_KEY, JSON.stringify(authData)),
      (async () => { cachedAuthData = authData; })()
    ]);
    
    return true;
  } catch (error) {
    console.log('[Location Service] Error saving auth data:', error);
    return false;
  }
};

// Add battery optimization function
const optimizeForBattery = async () => {
  try {
    const batteryStatus = await getBatteryStatus();
    const batteryLevel = batteryStatus?.batteryLevel || 1;
    lastBatteryLevel = batteryLevel * 100;
    
    // Enable low power mode if battery is below threshold
    isInLowPowerMode = lastBatteryLevel <= BATTERY_OPTIMIZATION_THRESHOLD;
    
    return isInLowPowerMode;
  } catch (error) {
    return false;
  }
};

// Function to check network connectivity using fetch
const checkNetworkConnectivity = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced to 3 seconds

    try {
      console.log('[Location Service] Testing network connectivity to:', API_ENDPOINTS.auth.test);
      const response = await fetch(`${API_ENDPOINTS.auth.test}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('[Location Service] Network connectivity check successful');
        return true;
      } else {
        console.log('[Location Service] Network check failed with status:', response.status);
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log('[Location Service] Network check timed out after 3 seconds');
      } else {
        console.log('[Location Service] Network check failed:', error.message);
      }
      return false;
    }
  } catch (error) {
    console.error('[Location Service] Error in network check:', error);
    return false;
  }
};

// Modify getAndSaveLocation function
const getAndSaveLocation = async () => {
  try {
    // Get current user first
    const user = firebase.auth().currentUser;
    if (!user?.email) {
      console.log('[Location Service] No authenticated user found');
      return null;
    }

    // Get user role from Firestore
    let userRole = null;
    try {
      const userDoc = await db.collection('users').doc(user.email.toLowerCase()).get();
      if (userDoc.exists) {
        userRole = userDoc.data()?.role || 'staff';
      }
    } catch (error) {
      console.error('[Location Service] Error getting user role:', error);
      // Try to get from cached data
      const cachedData = await getCachedUserData();
      userRole = cachedData?.role || 'staff';
    }

    // Get current location
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High
    });

    if (!location) {
      console.log('[Location Service] No location data available');
      return null;
    }

    // Get device info
    const deviceInfo = await getDeviceInfo();

    // Format current timestamp in IST
    const currentTime = formatDateTime(new Date());
    const isoTime = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString();

    // Prepare location data with email and role
    const locationData = {
      email: user.email.toLowerCase(),
      userRole: userRole,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: currentTime, // Formatted IST time
      formattedTime: currentTime, // Formatted IST time
      isoTimestamp: isoTime, // ISO format in IST
      accuracy: location.coords.accuracy,
      speed: location.coords.speed,
      heading: location.coords.heading,
      altitude: location.coords.altitude,
      deviceInfo: deviceInfo,
      appState: AppState.currentState,
      isBackground: AppState.currentState === 'background',
      timezone: 'Asia/Kolkata'
    };

    // Compare with last location; only save if changed
    if (
      lastLocationUpdate &&
      lastLocationUpdate.latitude === location.coords.latitude &&
      lastLocationUpdate.longitude === location.coords.longitude
    ) {
      console.log('[Location Service] Location unchanged, not saving to MongoDB');
      return location;
    }

    // Save to MongoDB with improved error handling
    try {
      await saveLocationToMongoDB(locationData);
      lastLocationUpdate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      };
      // Reset network retry count on success
      networkRetryCount = 0;
      isNetworkRetrying = false;
      console.log('[Location Service] Location saved to MongoDB with IST time:', currentTime);
    } catch (error) {
      // Only log network errors if not already retrying
      if (!isNetworkRetrying) {
        console.error('[Location Service] Error saving to MongoDB:', error);
        isNetworkRetrying = true;
        networkRetryCount++;
        // Retry after delay if under max retries
        if (networkRetryCount < MAX_NETWORK_RETRIES) {
          setTimeout(() => {
            isNetworkRetrying = false;
          }, NETWORK_RETRY_DELAY);
        }
      }
      // If MongoDB save fails, save offline
      await saveLocationOffline(locationData);
      console.log('[Location Service] Location saved offline with IST time:', currentTime);
    }

    return location;
  } catch (error) {
    console.error('[Location Service] Error getting location:', error);
    return null;
  }
};

const cacheSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
      settings,
      timestamp: Date.now()
    }));
  } catch (error) {}
};

const getCachedSettings = async () => {
  try {
    const cached = await AsyncStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const { settings, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < SETTINGS_REFRESH_INTERVAL) {
        return settings;
      }
    }
  } catch (error) {}
  return null;
};

let lastFetchedSettings = null;

const fetchSettings = async () => {
  try {
    const db = getFirestore();
    const settingsDocRef = doc(db, 'settings', 'attendance');
    const settingsDoc = await getDoc(settingsDocRef);
    
    if (!settingsDoc.exists()) {
      return null;
    }

    const settingsData = settingsDoc.data();
    const currentDay = new Date().toLocaleString('en-US', { weekday: 'long' });
    const daySettings = settingsData.workingDays?.[currentDay];

    if (!daySettings?.startTime || !daySettings?.endTime) {
      return null;
    }

    const workingHours = {
      startTime: daySettings.startTime,
      endTime: daySettings.endTime,
      autoAbsentTime: daySettings.autoAbsentTime || '23:15',
      lateMarkingTime: daySettings.lateMarkingTime || '09:30',
      isWorkingDay: daySettings.isWorking || false
    };

    const processedSettings = {
      workingHours,
      holidays: settingsData.holidays || []
    };

    if (JSON.stringify(lastFetchedSettings) !== JSON.stringify(processedSettings)) {
      lastFetchedSettings = JSON.parse(JSON.stringify(processedSettings));
    }

    await cacheSettings(processedSettings);
    return processedSettings;
  } catch (error) {
    return null;
  }
};

const startSettingsRefresh = () => {
  if (settingsRefreshInterval) {
    clearInterval(settingsRefreshInterval);
  }

  // Immediately fetch settings and check working hours
  fetchSettings().then(async settings => {
    if (settings) {
      const workingHoursCheck = await checkWorkingHours(true);
      if (workingHoursCheck.isWithinWorkingHours) {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);
        if (!isTracking) {
          await startLocationTracking();
        }
      } else {
        await stopLocationTracking();
      }
    }
  });

  // Then set up the interval for every 20 seconds
  settingsRefreshInterval = setInterval(async () => {
    const settings = await fetchSettings();
    if (settings) {
      const workingHoursCheck = await checkWorkingHours(true);
      if (workingHoursCheck.isWithinWorkingHours) {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);
        if (!isTracking) {
          await startLocationTracking();
        }
      } else {
        await stopLocationTracking();
      }
    }
  }, SETTINGS_REFRESH_INTERVAL);
};

const stopSettingsRefresh = () => {
  if (settingsRefreshInterval) {
    clearInterval(settingsRefreshInterval);
    settingsRefreshInterval = null;
  }
};

const getUserData = async (forceFresh = false) => {
  try {
    // Try to get cached data first, unless forceFresh is true
    if (!forceFresh) {
      const cachedData = await AsyncStorage.getItem(USER_DATA_CACHE_KEY);
      if (cachedData) {
        const { data, timestamp } = JSON.parse(cachedData);
        const age = Date.now() - timestamp;
        if (age < USER_DATA_CACHE_DURATION) {
          if (data?.workingHours?.startTime && data?.workingHours?.endTime) {
            return data;
          }
        }
      }
    }

    const settings = await fetchSettings();
    
    if (!settings?.workingHours) {
      return null;
    }

    // Check if today is a holiday
    const today = new Date().toISOString().split('T')[0];
    const isHoliday = settings.holidays?.some(holiday => holiday.date === today);
    
    if (isHoliday) {
      return null;
    }

    const userData = {
      workingHours: settings.workingHours
    };

    // Cache the fresh data
    await AsyncStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify({
      data: userData,
      timestamp: Date.now()
    }));

    return userData;
  } catch (error) {
    return null;
  }
};

let lastWorkingHoursCheck = 0;
const WORKING_HOURS_CACHE_DURATION = 10000; // 10 seconds cache

// Utility function to normalize time format
const normalizeTimeFormat = (timeStr) => {
  if (!timeStr) return null;
  // Remove any extra whitespace
  timeStr = timeStr.trim();
  
  // Convert 24:00 to 00:00
  if (timeStr === '24:00') {
    timeStr = '00:00';
  }
  
  // Add leading zero if needed
  if (timeStr.length === 4 && timeStr.includes(':')) {
    timeStr = '0' + timeStr;
  }
  return timeStr;
};

// Utility function to validate time format
const isValidTimeFormat = (timeStr) => {
  if (!timeStr) return false;
  timeStr = normalizeTimeFormat(timeStr);
  // Match format HH:MM where HH is 00-23 and MM is 00-59
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(timeStr);
};

const checkWorkingHours = async (forceFresh = false) => {
  try {
    const now = Date.now();
    
    // Use cached result if available and not expired
    if (!forceFresh && lastWorkingHoursResult && (now - lastWorkingHoursCheck) < WORKING_HOURS_CHECK_INTERVAL) {
      return lastWorkingHoursResult;
    }

    // Get settings from cache first unless forced to refresh
    let settings = !forceFresh ? await getCachedSettings() : null;
    
    // If no cached settings or force refresh, fetch from Firestore
    if (!settings) {
      settings = await fetchSettings();
    }

    // If no settings available, default to allowing tracking
    if (!settings) {
      const result = { 
        isWithinWorkingHours: true, 
        message: 'No working hours restrictions' 
      };
      lastWorkingHoursResult = result;
      lastWorkingHoursCheck = now;
      return result;
    }

    const currentDate = new Date();
    const currentDay = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    
    // Default working days (Monday to Friday)
    const defaultWorkingDays = [1, 2, 3, 4, 5];
    const workingDays = settings.workingDays || defaultWorkingDays;
    
    // If working days not specified, allow tracking
    if (!workingDays || workingDays.length === 0) {
      const result = { 
        isWithinWorkingHours: true, 
        message: 'No working days restrictions' 
      };
      lastWorkingHoursResult = result;
      lastWorkingHoursCheck = now;
      return result;
    }

    // Get current time in HH:mm format
    const currentTime = currentDate.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // Default working hours (24/7)
    const defaultStartTime = '00:00';
    const defaultEndTime = '23:59';
    
    // Get configured working hours
    const startTime = settings.startTime || defaultStartTime;
    const endTime = settings.endTime || defaultEndTime;

    // If no specific hours set, allow tracking
    if (!startTime || !endTime) {
      const result = { 
        isWithinWorkingHours: true, 
        message: 'No time restrictions' 
      };
      lastWorkingHoursResult = result;
      lastWorkingHoursCheck = now;
      return result;
    }

    // Normalize time formats
    const normalizedCurrentTime = normalizeTimeFormat(currentTime);
    const normalizedStartTime = normalizeTimeFormat(startTime);
    const normalizedEndTime = normalizeTimeFormat(endTime);

    // Compare times
    const isWithinHours = normalizedCurrentTime >= normalizedStartTime && 
                         normalizedCurrentTime <= normalizedEndTime;

    // Only log when status changes or once per minute
    const shouldLog = forceFresh || !lastWorkingHoursResult || 
                     lastWorkingHoursResult.isWithinWorkingHours !== isWithinHours ||
                     (now - lastWorkingHoursCheck) >= WORKING_HOURS_CHECK_INTERVAL;

    if (shouldLog) {
      if (isWithinHours) {
        console.log('[Location Service] Within working hours:', {
          current: normalizedCurrentTime,
          start: normalizedStartTime,
          end: normalizedEndTime
        });
      } else {
        console.log('[Location Service] Outside working hours:', {
          current: normalizedCurrentTime,
          start: normalizedStartTime,
          end: normalizedEndTime
        });
      }
    }

    const result = {
      isWithinWorkingHours: true, // Default to allowing tracking
      message: 'Tracking enabled',
      details: {
        currentTime: normalizedCurrentTime,
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
        currentDay,
        isWorkingDay: workingDays.includes(currentDay)
      }
    };

    // Cache the result
    lastWorkingHoursResult = result;
    lastWorkingHoursCheck = now;
    
    return result;
  } catch (error) {
    console.error('[Location Service] Error checking working hours:', error);
    // Default to allowing tracking on error
    const result = { 
      isWithinWorkingHours: true, 
      message: 'Error checking hours, defaulting to allowed',
      error: error.message 
    };
    lastWorkingHoursResult = result;
    lastWorkingHoursCheck = Date.now();
    return result;
  }
};

const isLocationServicesEnabled = async () => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    return false;
  }
};

// Add a new function to handle location alerts
const showLocationAlert = async () => {
  if (isShowingLocationAlert) return;
  
  isShowingLocationAlert = true;
  return new Promise((resolve) => {
    Alert.alert(
      'Location Required',
      'Location services are required for attendance tracking. Please enable location services to continue.',
      [
        {
          text: 'Enable Location',
          onPress: async () => {
            isShowingLocationAlert = false;
            if (Platform.OS === 'android') {
              try {
                await Location.enableNetworkProviderAsync();
              } catch (error) {
                Linking.openSettings();
              }
            } else {
              Linking.openSettings();
            }
            resolve(true);
          }
        },
        {
          text: 'Exit App',
          onPress: () => {
            isShowingLocationAlert = false;
            if (Platform.OS === 'android') {
              BackHandler.exitApp();
            }
            resolve(false);
          },
          style: 'cancel'
        }
      ],
      { 
        cancelable: false,
        onDismiss: () => {
          isShowingLocationAlert = false;
          resolve(false);
        }
      }
    );
  });
};

// Function to update location permission status
const updateLocationPermissionStatus = async (status) => {
  try {
    await AsyncStorage.setItem(LOCATION_PERMISSION_STATUS, JSON.stringify(status));
    // Emit event for any listeners
    locationPermissionEmitter.emit('locationPermissionChange', status);
  } catch (error) {
  }
};

// Function to get current location permission status
const getLocationPermissionStatus = async () => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return { allGranted: true }; // Pretend permissions are granted outside working hours
    }

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    const foregroundPermission = await Location.getForegroundPermissionsAsync();
    const backgroundPermission = await Location.getBackgroundPermissionsAsync();

    return {
      servicesEnabled,
      foregroundPermission: foregroundPermission.status === 'granted',
      backgroundPermission: backgroundPermission.status === 'granted',
      allGranted: servicesEnabled && 
                 foregroundPermission.status === 'granted' && 
                 backgroundPermission.status === 'granted'
    };
  } catch (error) {
    return {
      servicesEnabled: false,
      foregroundPermission: false,
      backgroundPermission: false,
      allGranted: false
    };
  }
};

// Update verifyLocationPermissions to use the new status system
const verifyLocationPermissions = async (retryCount = 0) => {
  try {
    const status = await getLocationPermissionStatus();
    await updateLocationPermissionStatus(status);

    if (!status.allGranted) {
      throw new Error('Location permissions not fully granted');
    }

    // Test getting current location
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeout: 15000
      });

      return true;
    } catch (error) {
      throw error;
    }
  } catch (error) {
    if (retryCount < 2 && !error.message.includes('permission')) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return verifyLocationPermissions(retryCount + 1);
    }
    throw error;
  }
};

// Enhance permission request function
const requestLocationPermissions = async (navigation) => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return true; // Pretend permission request succeeded outside working hours
    }

    // Check if location services are enabled first
    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) {
      // Navigate to LocationPermissionScreen
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name
            }
          }],
        });
        return false;
      }
    }

    // Check foreground permission
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      // Navigate to LocationPermissionScreen
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name
            }
          }],
        });
        return false;
      }
    }

    // Check background permission
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      // Navigate to LocationPermissionScreen
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name
            }
          }],
        });
        return false;
      }
    }

    // Emit event to notify LocationPermissionScreen that permissions are required
    locationPermissionNavigationEmitter.emit('requireLocationPermission', true);

    return true;
  } catch (error) {
    console.error('[Location Service] Error requesting permissions:', error);
    return false;
  }
};

// Add a function to check location requirements and navigate if needed
const enforceLocationPermissions = async (navigation) => {
  try {
    // Check if we're in working hours first
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return true;
    }

    // Check all location requirements
    const locationEnabled = await Location.hasServicesEnabledAsync();
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();

    // If any requirement is not met, navigate to LocationPermissionScreen
    if (!locationEnabled || foregroundStatus !== 'granted' || backgroundStatus !== 'granted') {
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name
            }
          }],
        });
      }
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Location Service] Error enforcing location permissions:', error);
    return false;
  }
};

// Add this helper function to safely manage tasks
const safelyStopLocationTask = async (taskName) => {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(taskName)
      .catch(() => false);
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(taskName);
      console.log(`[Location Service] Stopped task: ${taskName}`);
    }
  } catch (error) {
    console.log(`[Location Service] Task ${taskName} was not running`);
  }
};

// Add this helper function to check if we can start foreground service
const canStartForegroundService = () => {
  return Platform.OS === 'ios' || AppState.currentState === 'active';
};

// Update the startLocationTracking function's state change handler
const startLocationTracking = async (isBackground = false, navigation = null) => {
  try {
    console.log('[Location Service] Starting location tracking');

    // Check if we're restarting after kill
    const killedStateStr = await AsyncStorage.getItem(KILLED_STATE_KEY);
    const isRestartingAfterKill = killedStateStr ? JSON.parse(killedStateStr).wasKilled : false;

    // Check working hours first
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours, not starting tracking');
      return false;
    }

    // Create notification channel first
    await createNotificationChannel();

    // Check if location services are enabled
    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) {
      console.log('[Location Service] Location services are disabled');
      await showLocationAlert();
      return false;
    }

    // Request permissions with proper error handling
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('[Location Service] Foreground permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('[Location Service] Background permission denied');
      return false;
    }

    // Stop any existing tasks first
    await safelyStopLocationTask(LOCATION_TASK_NAME);
    await safelyStopLocationTask(BACKGROUND_TASK_NAME);

    // Ensure tasks are properly defined
    await registerBackgroundTasks();

    // Enhanced options for better background operation
    const enhancedOptions = {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: 15000, // 15 seconds
      distanceInterval: 10, // 10 meters
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.Other,
      // Only include foregroundService if we can start it and not restarting after kill
      ...(canStartForegroundService() && !isRestartingAfterKill ? {
        foregroundService: {
          notificationTitle: "Location Tracking Active",
          notificationBody: "Your location is being tracked for attendance",
          notificationColor: "#4CAF50",
          channelId: KEEP_ALIVE_CHANNEL_ID,
          enableVibrate: false,
          enableWakeLock: true,
          killServiceOnDestroy: false,
          startForeground: true,
          sticky: true
        }
      } : {})
    };

    // Background specific options
    const backgroundOptions = {
      ...enhancedOptions,
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000, // 30 seconds in background
      distanceInterval: 20, // 20 meters in background
      // Remove foregroundService for background
      foregroundService: undefined
    };

    // Start tracking based on state
    const currentState = AppState.currentState;
    console.log('[Location Service] Current app state:', currentState);

    let trackingOptions;
    let taskName;

    if (isRestartingAfterKill) {
      // Use background options without foreground service when restarting after kill
      trackingOptions = {
        ...backgroundOptions,
        foregroundService: undefined
      };
      taskName = BACKGROUND_TASK_NAME;
    } else {
      // Normal operation
      trackingOptions = currentState === 'active' ? enhancedOptions : backgroundOptions;
      taskName = currentState === 'active' ? LOCATION_TASK_NAME : BACKGROUND_TASK_NAME;
    }

    try {
      await Location.startLocationUpdatesAsync(taskName, trackingOptions);
      console.log(`[Location Service] Started tracking in ${isRestartingAfterKill ? 'restart' : currentState} state`);
    } catch (error) {
      if (error.message?.includes('foreground service')) {
        // Retry without foreground service
        const retryOptions = {
          ...trackingOptions,
          foregroundService: undefined
        };
        await Location.startLocationUpdatesAsync(taskName, retryOptions);
        console.log(`[Location Service] Started tracking without foreground service`);
      } else {
        throw error;
      }
    }

    // Clear kill state if we successfully started
    if (isRestartingAfterKill) {
      await AsyncStorage.removeItem(KILLED_STATE_KEY);
      await AsyncStorage.removeItem(LAST_TRACKING_TIME_KEY);
    }

    // Update tracking state
    await setTrackingActive(true);
    await saveTrackingState(true);
    
    console.log('[Location Service] Location tracking started successfully');
    return true;
  } catch (error) {
    console.error('[Location Service] Error starting location tracking:', error);
    return false;
  }
};

let forcedUpdateInterval = null;

const startForcedUpdates = () => {
  if (forcedUpdateInterval) {
    clearInterval(forcedUpdateInterval);
  }

  // Immediately try to get and save location
  getAndSaveLocation().catch(error => 
    console.error('[Location Service] Initial forced update failed:', error)
  );

  forcedUpdateInterval = setInterval(async () => {
    try {
      // Check working hours first
      const workingHoursCheck = await checkWorkingHours(true);
      if (!workingHoursCheck.isWithinWorkingHours) {
        console.log('[Location Service] Outside working hours, skipping forced update');
        return;
      }

      // Verify tracking is active
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (!isTracking) {
        console.log('[Location Service] Location tracking not active, restarting');
        await startLocationTracking();
      }

      // Get and save location
      await getAndSaveLocation();

      // Try to sync any offline locations
      await syncOfflineLocations().catch(error => 
        console.error('[Location Service] Failed to sync offline locations:', error)
      );
    } catch (error) {
      console.error('[Location Service] Error in forced update interval:', error);
    }
  }, LOCATION_UPDATE_INTERVAL);

  // Return cleanup function
  return () => {
    if (forcedUpdateInterval) {
      clearInterval(forcedUpdateInterval);
      forcedUpdateInterval = null;
    }
  };
};

const handleAppStateChange = async (nextAppState) => {
  try {
    const now = Date.now();
    if (now - lastStateChangeTime < STATE_CHANGE_DEBOUNCE) {
      return;
    }
    lastStateChangeTime = now;

    // Check working hours first
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      await stopLocationTracking();
      return;
    }

    if (nextAppState === 'active') {
      await initializeLocationTracking(true);
    }

    lastAppState = nextAppState;
  } catch (error) {
    console.error('[Location Service] Error handling app state change:', error);
  }
};

const startRecoveryCheck = async () => {
  if (recoveryCheckInterval) {
    clearInterval(recoveryCheckInterval);
  }

  recoveryCheckInterval = setInterval(async () => {
    try {
      // Check if tracking is still active
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);

      if (!isTracking) {
        const workingHoursCheck = await checkWorkingHours();
        
        if (workingHoursCheck.isWithinWorkingHours) {
          await startLocationTracking();
        } else {
          if (recoveryCheckInterval) {
            clearInterval(recoveryCheckInterval);
            recoveryCheckInterval = null;
          }
        }
      }
    } catch (error) {
    }
  }, RECOVERY_INTERVAL);
};

const stopRecoveryCheck = () => {
  if (recoveryCheckInterval) {
    clearInterval(recoveryCheckInterval);
    recoveryCheckInterval = null;
  }
};

const stopLocationTracking = async () => {
  try {
    console.log('[Location Service] Stopping location tracking');
    
    // Reset initialization flags
    hasInitialized = false;
    isInitializing = false;
    _isTrackingActive = false;
    
    // Stop all location tasks safely
    await safelyStopLocationTask(LOCATION_TASK_NAME);
    await safelyStopLocationTask(BACKGROUND_TASK_NAME);

    // Clear all intervals with proper checks
    [
      forcedUpdateInterval,
      recoveryCheckInterval,
      locationCheckInterval,
      settingsRefreshInterval,
      workingHoursCheckInterval
    ].forEach(interval => {
      if (interval) {
        clearInterval(interval);
      }
    });

    // Reset interval variables
    forcedUpdateInterval = null;
    recoveryCheckInterval = null;
    locationCheckInterval = null;
    settingsRefreshInterval = null;
    workingHoursCheckInterval = null;

    // Unregister all tasks
    try {
      await unregisterAllTasks();
      console.log('[Location Service] Tasks unregistered');
    } catch (error) {
      console.log('[Location Service] Error unregistering tasks:', error);
    }

    // Update tracking state in storage
    try {
      await AsyncStorage.setItem(TRACKING_ENABLED_KEY, 'false');
      await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify({
        wasTracking: false,
        timestamp: Date.now()
      }));
      console.log('[Location Service] Tracking state updated in storage');
    } catch (error) {
      console.log('[Location Service] Error updating tracking state:', error);
    }

    console.log('[Location Service] Location tracking stopped successfully');
    return true;
  } catch (error) {
    console.error('[Location Service] Error stopping location tracking:', error);
    return false;
  }
};

async function getDeviceInfo() {
  return {
    manufacturer: Device.manufacturer,
    model: Device.modelName,
    osVersion: Device.osVersion,
    isDevice: Device.isDevice,
    brand: Device.brand
  };
}

const ensureForegroundService = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      throw new Error('Permission to access location was denied');
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      throw new Error('Permission to access location in background was denied');
    }

    return true;
  } catch (error) {
    throw error;
  }
};

const saveCurrentUser = async () => {
  try {
    const user = firebase.auth().currentUser;
    if (user) {
      await AsyncStorage.setItem(LAST_USER_KEY, user.email);
    }
  } catch (error) {}
};

const BatteryManager = NativeModules.BatteryManager;
const batteryEventEmitter = new NativeEventEmitter(BatteryManager);

async function getBatteryStatus() {
  try {
    if (Platform.OS === 'android') {
      if (!BatteryManager) return null;
      const level = await BatteryManager.getBatteryLevel();
      const isCharging = await BatteryManager.isCharging();
      return { level, isCharging };
    } else if (Platform.OS === 'ios') {
      if (!BatteryManager) return null;
      const level = await BatteryManager.getBatteryLevel();
      const state = await BatteryManager.getBatteryState();
      return {
        level,
        isCharging: state === 'charging' || state === 'full'
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

const initializeBatteryMonitoring = () => {
  if (Platform.OS === 'ios') {
    BatteryManager?.setBatteryMonitoring?.(true);
  }
};

initializeBatteryMonitoring();
const isUserAuthorized = async () => {
  try {
    // First check Firebase auth state
    const user = firebase.auth().currentUser;
    if (!user?.email) {
      console.log('[Location Service] No Firebase user found');
      return false;
    }

    // Try to get cached data first
    const cachedData = await getCachedUserData();
    if (cachedData?.email === user.email && 
        cachedData?.role && 
        Date.now() - cachedData.timestamp < USER_CACHE_DURATION) {
      const role = cachedData.role.toLowerCase().trim();
      const isAuthorizedRole = ['staff', 'admin', 'super admin', 'faculty'].includes(role);
      
      if (isAuthorizedRole) {
        console.log('[Location Service] User authorized from cache:', cachedData.email);
        return true;
      }
    }

    // If no valid cached data or cache expired, check Firestore
    try {
      const userDoc = await db.collection('users').doc(user.email.toLowerCase()).get();
      if (!userDoc.exists) {
        console.log('[Location Service] User document not found:', user.email);
        return false;
      }

      const userData = userDoc.data();
      if (!userData) {
        console.log('[Location Service] Invalid user data from Firestore');
        return false;
      }

      const role = (userData.role || '').toLowerCase().trim();
      const isAuthorizedRole = ['staff', 'admin', 'super admin', 'faculty'].includes(role);

      if (isAuthorizedRole) {
        // Cache the valid user data with all required fields
        const cacheSuccess = await cacheUserData({
          email: user.email,
          role: userData.role,
          department: userData.department,
          id: userData.id,
          name: userData.name,
          isVerified: userData.isVerified
        });

        if (!cacheSuccess) {
          console.log('[Location Service] Failed to cache user data, but user is authorized');
        }

        console.log('[Location Service] User authorized from Firestore:', user.email);
        return true;
      }

      console.log('[Location Service] User role not authorized:', role);
      return false;
    } catch (error) {
      console.error('[Location Service] Error checking Firestore authorization:', error);
      return false;
    }
  } catch (error) {
    console.error('[Location Service] Error in authorization check:', error);
    return false;
  }
};

const checkAndManageTracking = async () => {
  if (isCheckingTracking) return;
  isCheckingTracking = true;

  try {
    const authorized = await isUserAuthorized();
    const workingHoursCheck = await checkWorkingHours();
    const shouldBeTracking = authorized && workingHoursCheck.isWithinWorkingHours;
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (shouldBeTracking) {
      // If we should be tracking, enable it and start if not already started
      await saveTrackingState(true);
      if (!isTracking) {
        await startLocationTracking();
      }
    } else if (!shouldBeTracking && isTracking) {
      // Only stop if we're outside working hours
      await stopLocationTracking();
      await saveTrackingState(false);
    }
  } catch (error) {
  } finally {
    isCheckingTracking = false;
  }
};

// Add new function for post-login tracking
const startPostLoginTracking = async () => {
  try {
    console.log('[Location Service] Starting post-login tracking check');
    
    // Check working hours first
    const workingHoursCheck = await checkWorkingHours(true);
    console.log('[Location Service] Working hours check:', workingHoursCheck);

    if (workingHoursCheck.isWithinWorkingHours) {
      // Start location tracking
      await startLocationTracking();
      console.log('[Location Service] Location tracking started');
      
      // Start settings refresh to keep tracking active during duty hours
      startSettingsRefresh();
      
      // Start monitoring location services
      await monitorLocationServices();
      
      // Start recovery check to ensure tracking stays active
      startRecoveryCheck();
    } else {
      console.log('[Location Service] Outside working hours, tracking not started');
      await stopLocationTracking();
    }
  } catch (error) {
    console.error('[Location Service] Error in post-login tracking:', error);
  }
};

// Using imported saveLocationToMongo from mongoService
const saveLocationToMongoDB = async (location) => {
  return await saveLocationToMongo(location);
};

// Modify monitorLocationServices to handle navigation initialization
const monitorLocationServices = async (navigation) => {
  if (!navigation) {
    console.log('[Location Service] Navigation not initialized yet');
    return;
  }

  if (locationCheckInterval) {
    clearInterval(locationCheckInterval);
  }

  const checkLocationStatus = async () => {
    try {
      const status = await getLocationPermissionStatus();
      await updateLocationPermissionStatus(status);

      if (!status.allGranted) {
        console.log('[Location Service] Location permissions not fully granted');
        
        // Stop any active tracking since location is not fully enabled/permitted
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);
        if (isTracking) {
          await stopLocationTracking();
        }

        // Emit event for navigation
        locationPermissionNavigationEmitter.emit('requireLocationPermission', true);
        
        // If navigation is provided and initialized, navigate to permission screen
        if (navigation && navigation.getCurrentRoute) {
          const currentRoute = navigation.getCurrentRoute()?.name;
          if (currentRoute !== 'LocationPermissionScreen') {
            navigation.reset({
              index: 0,
              routes: [
                { 
                  name: 'LocationPermissionScreen',
                  params: { returnTo: currentRoute }
                }
              ],
            });
          }
        }
      } else {
        // Check if tracking should be active and restart if needed
        const shouldBeTracking = await isLocationTrackingEnabled();
        if (shouldBeTracking) {
          const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
            .catch(() => false);
          if (!isTracking) {
            await startLocationTracking();
          }
        }
      }
    } catch (error) {
      console.error('[Location Service] Error in location status check:', error);
    }
  };

  // Check immediately
  await checkLocationStatus();
  
  // Then check at optimized interval
  locationCheckInterval = setInterval(checkLocationStatus, LOCATION_CHECK_INTERVAL);

  // Add event listener for location changes if available
  if (Platform.OS === 'android' && NativeModules.LocationServicesModule) {
    locationPermissionEmitter.addListener('locationServicesStatusChange', () => {
      checkLocationStatus();
    });
  }

  return () => {
    if (locationCheckInterval) {
      clearInterval(locationCheckInterval);
    }
  };
};

// Add function to check if location permission is required
const isLocationPermissionRequired = async () => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return false; // Don't require permissions outside working hours
    }

    // First check if location services are enabled
    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) {
      return true; // Location services need to be enabled
    }

    // Then check permissions
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();

    return !(foregroundStatus === 'granted' && backgroundStatus === 'granted');
  } catch (error) {
    console.error('[ERROR] Error checking location permission requirement:', error);
    return false;
  }
};

// Add new function to handle location services check and navigation
const checkAndRequestLocationServices = async (navigation) => {
  try {
    // Check if location services are enabled
    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) {
      // If navigation is provided, navigate to LocationPermissionScreen
      if (navigation) {
        const currentRoute = navigation.getCurrentRoute()?.name;
        if (currentRoute !== 'LocationPermissionScreen') {
          navigation.reset({
            index: 0,
            routes: [
              { 
                name: 'LocationPermissionScreen',
                params: { returnTo: currentRoute }
              }
            ],
          });
        }
      }
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Location Service] Error checking location services:', error);
    return false;
  }
};

// Add this function after the imports and constants
const testBackendConnection = async () => {
  try {
    console.log('[Location Service] Testing connection to backend:', API_URL);
    const isConnected = await testAPIConnection();
    if (isConnected) {
      console.log('[Location Service] Successfully connected to backend');
      return true;
    } else {
      console.error('[Location Service] Failed to connect to backend');
      return false;
    }
  } catch (error) {
    console.error('[Location Service] Error testing backend connection:', error);
    return false;
  }
};

// Modify the initializeLocationTracking function
const initializeLocationTracking = async (force = false) => {
  try {
    // Test backend connection first
    const isConnected = await testBackendConnection();
    if (!isConnected) {
      console.error('[Location Service] Cannot initialize - Backend not reachable');
      return false;
    }

    // Prevent rapid re-initialization attempts
    const now = Date.now();
    if (!force && now - lastInitAttempt < INIT_DEBOUNCE) {
      return false;
    }
    lastInitAttempt = now;

    // Prevent multiple simultaneous initializations
    if (isInitializing) {
      return false;
    }

    // Don't re-initialize if already initialized unless forced
    if (hasInitialized && !force) {
      return true;
    }

    isInitializing = true;

    // First check if we're within working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      await stopLocationTracking();
      isInitializing = false;
      return false;
    }

    // Check if user is authorized
    const authorized = await isUserAuthorized();
    if (!authorized) {
      await stopLocationTracking();
      isInitializing = false;
      return false;
    }

    // Check if tracking should be enabled
    const wasEnabled = await isLocationTrackingEnabled();
    if (!wasEnabled) {
      isInitializing = false;
      return false;
    }

    // Register background tasks if needed
    await registerBackgroundTasks();

    // Start tracking
    await startLocationTracking();
    
    // Setup app state listener only if we successfully started tracking
    setupAppStateListener();
    
    // Start offline sync service
    startOfflineSync();
    
    hasInitialized = true;
    isInitializing = false;
    return true;
  } catch (error) {
    console.error('[Location Service] Error in initialization:', error);
    await stopLocationTracking();
    isInitializing = false;
    return false;
  }
};

const registerBackgroundTasks = async () => {
  try {
    console.log('[Location Service] Registering background tasks');

    // Define the main location task
    if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
      TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data: { locations }, error }) => {
        if (error) {
          console.error('[Location Service] Background location task error:', error);
          return;
        }

        if (locations && locations.length > 0) {
          try {
            await getAndSaveLocation();
          } catch (error) {
            console.error('[Location Service] Error in background location task:', error);
          }
        }
      });
      console.log('[Location Service] Main location task defined');
    }

    // Define the background update task with aggressive settings
    if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_TASK_NAME, async ({ data, error }) => {
        try {
          if (error) {
            console.error('[Location Service] Background task error:', error);
            // Try to recover immediately
            await handleForceStop();
            return;
          }

          // Check working hours
          const workingHoursCheck = await checkWorkingHours();
          if (!workingHoursCheck.isWithinWorkingHours) {
            return;
          }

          // Always try to get location
          await getAndSaveLocation();

          // Check if we need to recover
          const forceStopStr = await AsyncStorage.getItem(FORCE_STOP_KEY);
          if (forceStopStr) {
            await handleForceStop();
          }

        } catch (error) {
          console.error('[Location Service] Error in background task:', error);
          // Try to recover immediately
          await handleForceStop();
        }
      });
      console.log('[Location Service] Background update task defined');
    }

    // Define the recovery task with immediate recovery
    if (!TaskManager.isTaskDefined(RECOVERY_TASK_NAME)) {
      TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
        try {
          // Check working hours first
          const workingHoursCheck = await checkWorkingHours();
          if (!workingHoursCheck.isWithinWorkingHours) {
            return BackgroundFetch.Result.NoData;
          }

          // Get location immediately
          await getAndSaveLocation();

          // Check if we need to recover
          const forceStopStr = await AsyncStorage.getItem(FORCE_STOP_KEY);
          if (forceStopStr) {
            await handleForceStop();
          } else {
            const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
              .catch(() => false);
            if (!isTracking) {
              await startLocationTracking(true);
            }
          }

          return BackgroundFetch.Result.NewData;
        } catch (error) {
          console.error('[Location Service] Recovery task error:', error);
          // Try to recover immediately
          await handleForceStop();
          return BackgroundFetch.Result.Failed;
        }
      });
      console.log('[Location Service] Recovery task defined');
    }

    // Register background fetch with aggressive settings
    if (!TaskManager.isTaskDefined(BACKGROUND_FETCH_TASK_NAME)) {
      TaskManager.defineTask(BACKGROUND_FETCH_TASK_NAME, async () => {
        try {
          console.log('[Location Service] Background fetch running');
          
          // Check working hours
          const workingHoursCheck = await checkWorkingHours();
          if (!workingHoursCheck.isWithinWorkingHours) {
            return BackgroundFetch.Result.NoData;
          }

          // Get location immediately
          await getAndSaveLocation();

          // Check if we need to recover
          const forceStopStr = await AsyncStorage.getItem(FORCE_STOP_KEY);
          if (forceStopStr) {
            await handleForceStop();
          }

          // Check if any tracking is active
          const mainTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
            .catch(() => false);
          const backgroundTracking = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK_NAME)
            .catch(() => false);

          if (!mainTracking && !backgroundTracking) {
            // Start aggressive tracking
            const options = {
              accuracy: Location.Accuracy.High,
              timeInterval: 20000, // 20 seconds
              distanceInterval: 0,
              deferredUpdatesInterval: 20000,
              deferredUpdatesDistance: 0,
              allowBackgroundLocationUpdates: true,
              showsBackgroundLocationIndicator: true
            };

            await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, options);
            console.log('[Location Service] Started aggressive tracking from fetch');
          }

          return BackgroundFetch.Result.NewData;
        } catch (error) {
          console.error('[Location Service] Background fetch error:', error);
          // Try to recover immediately
          await handleForceStop();
          return BackgroundFetch.Result.Failed;
        }
      });

      // Register background fetch with minimum interval
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
        minimumInterval: 20, // 20 seconds
        stopOnTerminate: false,
        startOnBoot: true
      });
      console.log('[Location Service] Background fetch registered with aggressive settings');
    }

    return true;
  } catch (error) {
    console.error('[Location Service] Error registering background tasks:', error);
    return false;
  }
};

const setupTerminationListener = () => {
  if (Platform.OS === 'android') {
    // Use 'background' state to save tracking state before app goes to background
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        try {
          // Save current state before app goes to background
          const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
            .catch(() => false);
          await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify({
            wasTracking: isTracking,
            timestamp: Date.now()
          }));
        } catch (error) {
          console.error('[Location Service] Error saving tracking state:', error);
        }
      }
    });

    // Return cleanup function
    return () => {
      subscription.remove();
    };
  }
  return () => {}; // Return empty cleanup function for iOS
};

const verifyLocationRequirements = async (navigation) => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return true; // Don't enforce requirements outside working hours
    }

    // Check location services first
    const locationEnabled = await Location.hasServicesEnabledAsync();
    if (!locationEnabled) {
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name,
              requirementType: 'services'
            }
          }],
        });
      }
      return false;
    }

    // Check foreground permission
    const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name,
              requirementType: 'foreground'
            }
          }],
        });
      }
      return false;
    }

    // Check background permission
    const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ 
            name: 'LocationPermissionScreen',
            params: { 
              returnTo: navigation.getCurrentRoute()?.name,
              requirementType: 'background'
            }
          }],
        });
      }
      return false;
    }

    // All requirements met
    return true;
  } catch (error) {
    console.error('[Location Service] Error verifying location requirements:', error);
    return false;
  }
};

const ensureLocationTrackingStarted = async (navigation) => {
  try {
    // First verify all location requirements are met
    const requirementsMet = await verifyLocationRequirements(navigation);
    if (!requirementsMet) {
      return false;
    }

    // Check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours, not starting tracking');
      return false;
    }

    // Check if user is authorized
    const authorized = await isUserAuthorized();
    if (!authorized) {
      console.log('[Location Service] User not authorized for location tracking');
      return false;
    }

    // Check if tracking is already active
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (!isTracking) {
      // Start tracking if not already active
      await startLocationTracking();
      
      // Start monitoring services
      await monitorLocationServices(navigation);
      
      // Start settings refresh
      startSettingsRefresh();
      
      // Start recovery check
      startRecoveryCheck();
    }

    return true;
  } catch (error) {
    console.error('[Location Service] Error ensuring location tracking:', error);
    return false;
  }
};

// Add this function to keep the service alive
const startKeepAliveService = async () => {
  try {
    if (Platform.OS === 'android') {
      // Start a foreground service
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        ...LOCATION_TASK_OPTIONS,
        foregroundService: {
          notificationTitle: "Location Tracking Active",
          notificationBody: "Your location is being tracked for attendance",
          notificationColor: "#4CAF50",
          killServiceOnDestroy: false,
          startForeground: true,
          sticky: true,
          channelId: KEEP_ALIVE_CHANNEL_ID
        },
        // More aggressive settings for keeping alive
        timeInterval: 15000, // 15 seconds
        deferredUpdatesInterval: 15000, // 15 seconds
        deferredUpdatesDistance: 10, // 10 meters
        allowBackgroundLocationUpdates: true,
        pausesUpdatesAutomatically: false
      });

      // Start background fetch to keep app alive
      await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
        minimumInterval: 15 * 60, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true
      });
    }
  } catch (error) {
    console.error('[Location Service] Error starting keep-alive service:', error);
  }
};

// Function to handle app kill state
const handleAppKilled = async () => {
  try {
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours, not persisting kill state');
      return;
    }

    // Save that we were tracking when killed
    await AsyncStorage.setItem(KILLED_STATE_KEY, JSON.stringify({
      wasKilled: true,
      timestamp: Date.now(),
      workingHours: workingHoursCheck.details
    }));

    // Register background fetch with minimum interval
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
      minimumInterval: 15 * 60, // 15 minutes (minimum allowed)
      stopOnTerminate: false,
      startOnBoot: true
    });

    console.log('[Location Service] App kill state handled');
  } catch (error) {
    console.error('[Location Service] Error handling app kill:', error);
  }
};

// Function to restart tracking after kill
const restartTrackingAfterKill = async () => {
  try {
    // Check if we were killed
    const killedStateStr = await AsyncStorage.getItem(KILLED_STATE_KEY);
    if (!killedStateStr) return false;

    const killedState = JSON.parse(killedStateStr);
    if (!killedState.wasKilled) return false;

    // Check working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours, not restarting');
      return false;
    }

    // Check last restart attempt
    const lastAttemptStr = await AsyncStorage.getItem(LAST_TRACKING_TIME_KEY);
    if (lastAttemptStr) {
      const lastAttempt = JSON.parse(lastAttemptStr);
      const timeSinceLastAttempt = Date.now() - lastAttempt.timestamp;
      
      if (timeSinceLastAttempt < RESTART_ATTEMPT_INTERVAL) {
        console.log('[Location Service] Too soon to retry restart');
        return false;
      }

      if (lastAttempt.attempts >= MAX_RESTART_ATTEMPTS) {
        console.log('[Location Service] Max restart attempts reached');
        return false;
      }
    }

    // Try to restart tracking
    const options = {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 30000, // 30 seconds
      distanceInterval: 20, // 20 meters
      // No foreground service when restarting after kill
    };

    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, options);
    
    // Update last attempt
    await AsyncStorage.setItem(LAST_TRACKING_TIME_KEY, JSON.stringify({
      timestamp: Date.now(),
      attempts: lastAttemptStr ? JSON.parse(lastAttemptStr).attempts + 1 : 1
    }));

    console.log('[Location Service] Tracking restarted after kill');
    return true;
  } catch (error) {
    console.error('[Location Service] Error restarting after kill:', error);
    return false;
  }
};

// Add this function to handle force stop
const handleForceStop = async () => {
  try {
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return;
    }

    console.log('[Location Service] Handling force stop, attempting immediate restart');

    // Save force stop state
    await AsyncStorage.setItem(FORCE_STOP_KEY, JSON.stringify({
      wasForceStoped: true,
      timestamp: Date.now(),
      workingHours: workingHoursCheck.details
    }));

    // Register all possible background tasks
    await registerBackgroundTasks();

    // Configure aggressive tracking options
    const aggressiveOptions = {
      accuracy: Location.Accuracy.High,
      timeInterval: 20000, // 20 seconds
      distanceInterval: 0, // Update regardless of distance
      deferredUpdatesInterval: 20000, // 20 seconds
      deferredUpdatesDistance: 0, // Update regardless of distance
      allowBackgroundLocationUpdates: true,
      showsBackgroundLocationIndicator: true,
      // Android specific
      android: {
        accuracy: Location.Accuracy.High,
        timeInterval: 20000,
        distanceInterval: 0,
        allowBackgroundLocationUpdates: true
      },
      // iOS specific
      ios: {
        activityType: Location.ActivityType.OtherNavigation,
        allowsBackgroundLocationUpdates: true,
        showsBackgroundLocationIndicator: true,
        pausesLocationUpdatesAutomatically: false
      }
    };

    // Start immediate background tracking
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, aggressiveOptions);
    console.log('[Location Service] Started aggressive tracking after force stop');

    // Register background fetch with aggressive settings
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK_NAME, {
      minimumInterval: 20, // 20 seconds
      stopOnTerminate: false,
      startOnBoot: true
    });

    // Get location immediately
    await getAndSaveLocation();

  } catch (error) {
    console.error('[Location Service] Error handling force stop:', error);
    // Try alternative method if first attempt fails
    try {
      const fallbackOptions = {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 20000,
        distanceInterval: 0
      };
      await Location.startLocationUpdatesAsync(BACKGROUND_TASK_NAME, fallbackOptions);
      console.log('[Location Service] Started fallback tracking after force stop');
    } catch (fallbackError) {
      console.error('[Location Service] Fallback tracking failed:', fallbackError);
    }
  }
};

// Export the new function
export {
  startLocationTracking,
  stopLocationTracking,
  initializeLocationTracking,
  isLocationTrackingEnabled,
  syncOfflineLocations,
  setupTerminationListener,
  monitorLocationServices,
  verifyLocationRequirements,
  getLocationPermissionStatus,
  locationPermissionEmitter,
  startPostLoginTracking,
  ensureLocationTrackingStarted,
  isLocationPermissionRequired,
  locationPermissionNavigationEmitter,
  checkWorkingHours,
  checkAndRequestLocationServices
};