import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as BackgroundTask from 'expo-background-task';
import { Platform, AppState, NativeEventEmitter, NativeModules, Alert, Linking, BackHandler } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { firebase as firebaseInstance, getAuth, db } from './Firebase/firebaseConfig';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { saveLocationToMongo, saveLocationOffline, syncOfflineLocations } from './mongoService';
import env from '../config/env';

// Constants
const LOCATION_TASK_NAME = 'background-location-task';
const RECOVERY_TASK_NAME = 'location-recovery-task';
const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const LOCATION_UPDATE_INTERVAL = 20000; // 20 seconds
const RECOVERY_INTERVAL = 60000; // Increased to 1 minute to save battery
const LOCATION_DISTANCE_INTERVAL = 10; // Only update if moved 10 meters
const BACKGROUND_UPDATE_INTERVAL = 20000; // 20 seconds
const BACKGROUND_DISTANCE_INTERVAL = 10; // Only update if moved 10 meters
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 30000; // Increased to 30 seconds
const SETTINGS_REFRESH_INTERVAL = 60000; // Increased to 1 minute
const SETTINGS_CACHE_KEY = '@attendance_settings_cache';
const USER_DATA_CACHE_KEY = '@user_data_cache';
const USER_DATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const LOCATION_PERMISSION_STATUS = '@location_permission_status';
const WORKING_HOURS_CHECK_INTERVAL = 60000; // Increased to 1 minute
const TRACKING_STATE_KEY = '@location_tracking_state';
const BATTERY_OPTIMIZATION_THRESHOLD = 20; // Battery percentage threshold for optimization

// Track active state
let _isTrackingActive = false;
let lastLocationUpdate = null;
let cachedAuthData = null;
let lastBatteryLevel = 100;
let isInLowPowerMode = false;

// Function to safely update tracking state
const setTrackingActive = async (value) => {
  _isTrackingActive = value;
  await AsyncStorage.setItem('isTrackingActive', value ? 'true' : 'false');
};
let isCheckingTracking = false;
let lastAppState = AppState.currentState;
let lastStateChangeTime = Date.now();
let stateChangeTimeout = null;
let backgroundTaskRegistered = false;
let settingsRefreshInterval = null;

// Remove any existing app state listeners and add our debounced handler
let appStateSubscription = null;

// Add these variables at the top of the file after imports
let locationCheckInterval = null;
let isShowingLocationAlert = false;

let recoveryCheckInterval = null;

// Add event emitter for location permission status changes
const locationPermissionEmitter = new NativeEventEmitter(NativeModules.LocationServicesModule || {});

// Add this at the top with other variables
let workingHoursCheckInterval = null;

// Add these at the top with other variables
let isInitializing = false;
let hasInitialized = false;
let lastInitAttempt = 0;
const INIT_DEBOUNCE = 5000; // 5 seconds debounce for initialization attempts

// Add navigation event emitter
const locationPermissionNavigationEmitter = new NativeEventEmitter(NativeModules.LocationServicesModule || {});

// Add a queue for pending navigation actions
let pendingNavigationActions = [];
let isNavigationReady = false;

// Add function to handle navigation readiness
const setNavigationReady = (ready) => {
  isNavigationReady = ready;
  if (ready) {
    // Process any pending navigation actions
    while (pendingNavigationActions.length > 0) {
      const action = pendingNavigationActions.shift();
      action();
    }
  }
};

const setupAppStateListener = () => {
  if (appStateSubscription) {
    appStateSubscription.remove();
  }
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
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

    // First check if we have valid cached data
    if (cachedAuthData) {
      return cachedAuthData;
    }

    // If no in-memory cache, try to get from AsyncStorage
    const data = await AsyncStorage.getItem(USER_AUTH_KEY);
    if (data) {
      try {
        const parsedData = JSON.parse(data);
        // Validate the cached data
        if (parsedData && parsedData.email && parsedData.role) {
          cachedAuthData = parsedData;
          return parsedData;
        }
      } catch (e) {
        // Silent error handling for cache parsing
      }
    }

    // If no valid cached data, try to get fresh data
    const user = firebase.auth().currentUser;
    if (user) {
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
    }
    return null;
  } catch (error) {
    return null;
  }
};

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await getAndSaveLocation();
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    return BackgroundFetch.Result.Failed;
  }
});

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

// Modify getAndSaveLocation function
const getAndSaveLocation = async () => {
  try {
    // Check working hours first
    const workingHoursCheck = await checkWorkingHours(true); // Force fresh check
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours, skipping location update');
      return;
    }

    // Get user data first to ensure we have valid credentials
    const userData = await getCachedAuthData();
    if (!userData?.email) {
      console.log('[Location Service] No user data available, skipping location update');
      return;
    }

    // Check battery status and optimize if needed
    const isLowPower = await optimizeForBattery();
    
    const locationOptions = {
      accuracy: isLowPower ? Location.Accuracy.Balanced : Location.Accuracy.BestForNavigation,
      maximumAge: isLowPower ? 30000 : 0, // Allow 30s old locations in low power mode
      timeout: isLowPower ? 10000 : 5000,
      distanceInterval: isLowPower ? 20 : LOCATION_DISTANCE_INTERVAL // Increase distance threshold in low power mode
    };

    console.log('[Location Service] Attempting to get current location');
    const location = await Location.getCurrentPositionAsync(locationOptions);

    if (location) {
      const deviceInfo = await getDeviceInfo();
      const locationData = {
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        appState: AppState.currentState,
        createdAt: new Date().toISOString(),
        deviceInfo,
        heading: location.coords.heading,
        isBackground: AppState.currentState !== 'active',
        lastUpdate: new Date().toISOString(),
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        speed: location.coords.speed,
        timestamp: location.timestamp,
        userId: userData.email,
        userRole: userData.role,
        batteryLevel: lastBatteryLevel,
        isLowPowerMode: isInLowPowerMode,
        workingHours: workingHoursCheck.workingHours // Include working hours info
      };

      console.log('[Location Service] Saving location to MongoDB:', {
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        timestamp: locationData.timestamp
      });

      // Only save to MongoDB
      try {
        await saveLocationToMongo(locationData);
        console.log('[Location Service] Successfully saved to MongoDB');
        lastLocationUpdate = new Date();
      } catch (mongoError) {
        console.error('[Location Service] Failed to save to MongoDB:', mongoError);
        // Save offline as backup
        await saveLocationOffline(locationData);
        console.log('[Location Service] Saved location data offline');
      }
    } else {
      console.log('[Location Service] No location data received');
    }
  } catch (error) {
    console.error('[Location Service] Error in getAndSaveLocation:', error);
    // Try to save the error for debugging
    try {
      await AsyncStorage.setItem('lastLocationError', JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    } catch (storageError) {}
  }
};

TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
  try {
    await getAndSaveLocation();
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (!isTracking) {
      await startLocationTracking();
    }
    startForcedUpdates();
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    return BackgroundFetch.Result.Failed;
  }
});

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data: { locations }, error }) => {
  if (error) {
    console.error('[Location Service] Background location task error:', error);
    return;
  }

  if (locations && locations.length > 0) {
    const location = locations[locations.length - 1];
    try {
      await getAndSaveLocation();
    } catch (error) {
      console.error('[Location Service] Error in background location task:', error);
    }
  }
});

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

let lastWorkingHoursCheck = null;
let lastWorkingHoursCheckTime = null;
const WORKING_HOURS_CACHE_DURATION = 10000; // 10 seconds cache

// Utility function to normalize time format
const normalizeTimeFormat = (timeStr) => {
  if (!timeStr) return null;
  // Remove any extra whitespace
  timeStr = timeStr.trim();
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
    const now = new Date();
    
    // Use cached result if available and not forced refresh
    if (!forceFresh && lastWorkingHoursCheck && lastWorkingHoursCheckTime) {
      const timeSinceLastCheck = now.getTime() - lastWorkingHoursCheckTime;
      if (timeSinceLastCheck < WORKING_HOURS_CACHE_DURATION) {
        return lastWorkingHoursCheck;
      }
    }

    const userData = await getUserData(forceFresh);
    if (!userData?.workingHours) {
      lastWorkingHoursCheck = { isWithinWorkingHours: false, reason: 'No working hours defined' };
      lastWorkingHoursCheckTime = now.getTime();
      return lastWorkingHoursCheck;
    }

    const { startTime: rawStartTime, endTime: rawEndTime, isWorkingDay } = userData.workingHours;
    
    // Normalize time formats
    const startTime = normalizeTimeFormat(rawStartTime);
    const endTime = normalizeTimeFormat(rawEndTime);

    // Check if it's a working day
    if (!isWorkingDay) {
      lastWorkingHoursCheck = { isWithinWorkingHours: false, reason: 'Not a working day' };
      lastWorkingHoursCheckTime = now.getTime();
      return lastWorkingHoursCheck;
    }

    // Validate time format
    if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime)) {
      lastWorkingHoursCheck = { 
        isWithinWorkingHours: false, 
        reason: 'Invalid time format', 
        details: { startTime: rawStartTime, endTime: rawEndTime }
      };
      lastWorkingHoursCheckTime = now.getTime();
      if (__DEV__) {
        console.log('[Working Hours Check] Invalid time format:', { startTime: rawStartTime, endTime: rawEndTime });
      }
      return lastWorkingHoursCheck;
    }

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    let endMinutes = endHour * 60 + endMinute;

    // Handle overnight shifts
    if (endHour < startHour) {
      endMinutes += 24 * 60; // Add 24 hours
      if (currentHour < startHour) {
        // We're in the early hours of the next day
        endMinutes -= 24 * 60;
      }
    }

    const isWithinWorkingHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;

    // Cache the result
    lastWorkingHoursCheck = { 
      isWithinWorkingHours,
      reason: isWithinWorkingHours ? 'Within working hours' : 'Outside working hours',
      currentTime: `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`,
      workingHours: { startTime, endTime }
    };
    lastWorkingHoursCheckTime = now.getTime();

    // Handle tracking state changes
    if (lastWorkingHoursCheck?.isWithinWorkingHours !== isWithinWorkingHours) {
      if (!isWithinWorkingHours) {
        await stopLocationTracking();
        // Clear all intervals
        [settingsRefreshInterval, locationCheckInterval, recoveryCheckInterval, workingHoursCheckInterval]
          .forEach(interval => {
            if (interval) {
              clearInterval(interval);
              interval = null;
            }
          });
      }
    }

    return lastWorkingHoursCheck;
  } catch (error) {
    console.error('[ERROR] Error checking working hours:', error);
    lastWorkingHoursCheck = { isWithinWorkingHours: false, reason: 'Error checking working hours' };
    lastWorkingHoursCheckTime = now.getTime();
    return lastWorkingHoursCheck;
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

const requestLocationPermissions = async () => {
  try {
    // First check if we're in working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return true; // Pretend permission request succeeded outside working hours
    }

    // Force request foreground permission
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();

    if (foregroundStatus !== 'granted') {
      Alert.alert(
        'Location Permission Required',
        'This app needs location access to track attendance. Please enable location access in settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    // Force request background permission
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    if (backgroundStatus !== 'granted') {
      Alert.alert(
        'Background Location Required',
        'This app needs background location access to track attendance when the app is closed.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

const startLocationTracking = async (isBackground = false) => {
  try {
    console.log('[Location Service] Starting location tracking');
    
    // Check if tracking is already active
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      console.log('[Location Service] Tracking already active');
      return true;
    }

    // Check working hours first
    const workingHoursCheck = await checkWorkingHours(true);
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[Location Service] Outside working hours');
      await stopLocationTracking();
      return false;
    }

    // Check location permissions
    const permissionStatus = await getLocationPermissionStatus();
    if (!permissionStatus.allGranted) {
      console.log('[Location Service] Location permissions not granted');
      await AsyncStorage.setItem('isTrackingActive', 'false');
      return false;
    }

    // Get user data
    const userData = await getCachedAuthData();
    if (!userData) {
      console.log('[Location Service] No user data available');
      return false;
    }

    // Set tracking as active
    await setTrackingActive(true);

    // Start location updates with enhanced error handling
    try {
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: LOCATION_UPDATE_INTERVAL, // 20 seconds
        distanceInterval: 0,
        showsBackgroundLocationIndicator: true,
        pausesUpdatesAutomatically: false,
        activityType: Location.ActivityType.Other,
        foregroundService: {
          notificationTitle: 'Location Tracking Active',
          notificationBody: 'Tracking your location for attendance',
          notificationColor: '#2196F3',
        }
      });
      
      console.log('[Location Service] Location updates started successfully');
      return true;
    } catch (error) {
      console.error('[Location Service] Error starting location updates:', error);
      await stopLocationTracking();
      return false;
    }
  } catch (error) {
    console.error('[Location Service] Error in startLocationTracking:', error);
    await stopLocationTracking();
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
  }
};

const registerBackgroundTasks = async () => {
  try {
    if (!backgroundTaskRegistered) {
      await TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
        try {
          const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
            .catch(() => false);

          if (!isTracking) {
            await startLocationTracking();
          }
          return BackgroundFetch.Result.NewData;
        } catch (error) {
          return BackgroundFetch.Result.Failed;
        }
      });
      backgroundTaskRegistered = true;
    }
  } catch (error) {}
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
    // Reset initialization flags
    hasInitialized = false;
    isInitializing = false;
    
    // Stop location updates
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }

    // Clear all intervals EXCEPT working hours check
    if (forcedUpdateInterval) {
      clearInterval(forcedUpdateInterval);
      forcedUpdateInterval = null;
    }
    
    if (recoveryCheckInterval) {
      clearInterval(recoveryCheckInterval);
      recoveryCheckInterval = null;
    }
    
    if (locationCheckInterval) {
      clearInterval(locationCheckInterval);
      locationCheckInterval = null;
    }

    // Stop background tasks
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);
    } catch (error) {
      // Task might not be registered
    }
    
    try {
      await BackgroundFetch.unregisterTaskAsync(RECOVERY_TASK_NAME);
    } catch (error) {
      // Task might not be registered
    }

    // Update tracking state
    await setTrackingActive(false);
    
    // Stop settings refresh
    stopSettingsRefresh();
    
    // Stop recovery check
    stopRecoveryCheck();

    // Start working hours check if not already running
    if (!workingHoursCheckInterval) {
      startWorkingHoursCheck();
    }
  } catch (error) {
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
    const userData = await getCachedAuthData();
    if (!userData?.email || !userData?.role) {
      return false;
    }

    const role = userData.role.toLowerCase();
    const isAuthorizedRole = ['staff', 'admin', 'Super Admin'].includes(role);
    
    if (!isAuthorizedRole) {
      await stopLocationTracking();
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Location Service] Error checking user authorization:', error);
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
  
  // Then check frequently
  locationCheckInterval = setInterval(checkLocationStatus, 1000);

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

    const permissionStatus = await getLocationPermissionStatus();
    return !permissionStatus.allGranted;
  } catch (error) {
    console.error('[ERROR] Error checking location permission requirement:', error);
    return false;
  }
};

// Add new function to handle location permission navigation
const handleLocationPermissionNavigation = (navigation) => {
  if (!navigation) return;
  
  // Navigate to LocationPermissionScreen
  navigation.reset({
    index: 0,
    routes: [{ name: 'LocationPermissionScreen' }],
  });
};

// Add this function to verify location requirements
const verifyLocationRequirements = async () => {
  try {
    // Check permissions first
    const permissionsGranted = await requestLocationPermissions();
    if (!permissionsGranted) {
      Alert.alert(
        'Location Permission Required',
        'This app requires location permission to function. Please grant location permission to continue.',
        [
          {
            text: 'Open Settings',
            onPress: () => Linking.openSettings(),
          },
          {
            text: 'Exit App',
            onPress: () => {
              if (Platform.OS === 'android') {
                BackHandler.exitApp();
              }
            },
            style: 'cancel',
          },
        ],
        { cancelable: false }
      );
      return false;
    }

    // Then check if location services are enabled
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      Alert.alert(
        'Location Services Required',
        'This app requires location services to be enabled. Please enable location services to continue.',
        [
          {
            text: 'Enable Location',
            onPress: async () => {
              if (Platform.OS === 'android') {
                try {
                  await Location.enableNetworkProviderAsync();
                } catch (error) {
                  Linking.openSettings();
                }
              } else {
                Linking.openSettings();
              }
            },
          },
          {
            text: 'Exit App',
            onPress: () => {
              if (Platform.OS === 'android') {
                BackHandler.exitApp();
              }
            },
            style: 'cancel',
          },
        ],
        { cancelable: false }
      );
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
};

// Update the initializeLocationTracking function
const initializeLocationTracking = async (force = false) => {
  try {
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
    
    hasInitialized = true;
    isInitializing = false;
    return true;
  } catch (error) {
    await stopLocationTracking();
    isInitializing = false;
    return false;
  }
};

// Add a new function to check and restart tracking if needed
const checkAndRestartTracking = async () => {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (!isTracking) {
      await startLocationTracking();
    }
  } catch (error) {
  }
};

// Add a new function to ensure tracking is active
const ensureTrackingActive = async () => {
  try {
    const wasEnabled = await isLocationTrackingEnabled();
    if (wasEnabled) {
      await startLocationTracking();
    }
  } catch (error) {
  }
};

// Add a new function to handle app termination
const handleAppTermination = async () => {
  try {
    await checkAndRestartTracking();
  } catch (error) {
  }
};

// Add a new function to setup termination listener
const setupTerminationListener = () => {
  if (Platform.OS === 'android') {
    AppState.addEventListener('change', async (nextAppState) => {
      if (nextAppState === 'inactive') {
        await handleAppTermination();
      }
    });
  }
};

// Track previous state to reduce unnecessary logs
let lastWorkingHoursState = null;
let lastTrackingState = null;

// Modify the working hours check function
const startWorkingHoursCheck = () => {
  if (workingHoursCheckInterval) {
    clearInterval(workingHoursCheckInterval);
    workingHoursCheckInterval = null;
  }

  // Do an immediate check
  checkWorkingHours(true).then(async result => {
    if (result.isWithinWorkingHours) {
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      if (!isTracking) {
        await startLocationTracking();
      }
    }
  });

  // Set up the interval
  workingHoursCheckInterval = setInterval(async () => {
    try {
      const result = await checkWorkingHours();
      if (__DEV__) {
        console.log('[Working Hours Check]', result);
      }
      
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);

      if (result.isWithinWorkingHours && !isTracking) {
        await startLocationTracking();
      } else if (!result.isWithinWorkingHours && isTracking) {
        await stopLocationTracking();
      }
    } catch (error) {
      if (__DEV__) {
        console.error('[ERROR] Error in working hours check interval:', error);
      }
    }
  }, LOCATION_UPDATE_INTERVAL);
};

// Start the working hours check when the module loads
startWorkingHoursCheck();

// Add new function to ensure location tracking is active
const ensureLocationTrackingStarted = async () => {
  try {
    console.log('[Location Service] Checking location tracking status');
    
    // Check if tracking is currently active
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (!isTracking) {
      console.log('[Location Service] Location tracking not active, attempting to start');
      
      // Verify location permissions first
      const permissionStatus = await getLocationPermissionStatus();
      if (!permissionStatus.allGranted) {
        console.log('[Location Service] Requesting location permissions');
        const granted = await requestLocationPermissions();
        if (!granted) {
          console.log('[Location Service] Location permissions not granted');
          return false;
        }
      }

      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        console.log('[Location Service] Location services not enabled');
        await showLocationAlert();
        return false;
      }

      // Check working hours
      const workingHoursCheck = await checkWorkingHours(true);
      console.log('[Location Service] Working hours check:', workingHoursCheck);

      if (workingHoursCheck.isWithinWorkingHours) {
        // Start location tracking
        await startLocationTracking();
        console.log('[Location Service] Location tracking started successfully');
        
        // Start all monitoring services
        startSettingsRefresh();
        await monitorLocationServices();
        startRecoveryCheck();
        startWorkingHoursCheck();
        
        return true;
      } else {
        console.log('[Location Service] Outside working hours, tracking not started');
        return false;
      }
    } else {
      console.log('[Location Service] Location tracking is already active');
      return true;
    }
  } catch (error) {
    console.error('[Location Service] Error ensuring location tracking:', error);
    return false;
  }
};

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
  checkWorkingHours
};