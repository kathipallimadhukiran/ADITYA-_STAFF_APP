import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { Platform, AppState, NativeEventEmitter, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { firebase as firebaseInstance, getAuth, db } from './Firebase/firebaseConfig';
import * as Device from 'expo-device';

// Constants
const LOCATION_TASK_NAME = 'background-location-task';
const RECOVERY_TASK_NAME = 'location-recovery-task';
const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const LOCATION_UPDATE_INTERVAL = 60000; // 1 minute
const RECOVERY_INTERVAL = 60000; // 1 minute
const LOCATION_DISTANCE_INTERVAL = 5; // Update every 5 meters
const BACKGROUND_UPDATE_INTERVAL = 60000; // 1 minute
const BACKGROUND_DISTANCE_INTERVAL = 5; // Update every 5 meters
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 10000; // 1 second debounce for state changes

// Track active state
let isTrackingActive = false;
let lastLocationUpdate = null;
let cachedAuthData = null;
let isCheckingTracking = false;
let lastAppState = AppState.currentState;
let lastStateChangeTime = Date.now();
let stateChangeTimeout = null;
let backgroundTaskRegistered = false;

// Remove any existing app state listeners and add our debounced handler
let appStateSubscription = null;

const setupAppStateListener = () => {
  // Remove existing subscription if any
  if (appStateSubscription) {
    appStateSubscription.remove();
  }
  
  // Add new subscription with debounced handler
  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
};

// Function to check if tracking should be enabled
const isLocationTrackingEnabled = async () => {
  try {
    const enabled = await AsyncStorage.getItem(TRACKING_ENABLED_KEY);
    return enabled === 'true';
  } catch (error) {
    console.error('🔴 Error checking tracking state:', error);
    return false;
  }
};

// Function to save tracking state
const saveTrackingState = async (enabled) => {
  try {
    await AsyncStorage.setItem(TRACKING_ENABLED_KEY, enabled ? 'true' : 'false');
  } catch (error) {
    console.error('🔴 Error saving tracking state:', error);
  }
};

// Cache auth data for background use
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
      console.log('✅ Auth data cached:', authData);
    }
  } catch (error) {
    console.error('🔴 Error caching auth data:', error);
  }
};

// Get cached auth data
const getCachedAuthData = async () => {
  try {
    if (cachedAuthData) return cachedAuthData;
    const data = await AsyncStorage.getItem(USER_AUTH_KEY);
    if (data) {
      cachedAuthData = JSON.parse(data);
      return cachedAuthData;
    }
  } catch (error) {
    console.error('🔴 Error getting cached auth data:', error);
  }
  return null;
};

// Register multiple background tasks for redundancy
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    console.log('📍 Background fetch running');
    await getAndSaveLocation();
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    console.error('🔴 Background fetch error:', error);
    return BackgroundFetch.Result.Failed;
  }
});

// Utility function to get and save location
const getAndSaveLocation = async () => {
  try {
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      maximumAge: 0,
      timeout: 5000
    });
    
    if (location) {
      await saveLocationToFirebase(location).catch(async (error) => {
        await saveLocationOffline(location);
      });
    }
  } catch (error) {
    console.error('🔴 Get location error:', error);
  }
};

// Recovery task that runs frequently
TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
  try {
    console.log('🔄 Recovery running');
    
    // Always try to get location first
    await getAndSaveLocation();

    // Check and restart tracking if needed
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (!isTracking) {
      await startLocationTracking();
    }

    // Start forced updates anyway
    startForcedUpdates();

    return BackgroundFetch.Result.NewData;
  } catch (error) {
    console.error('🔴 Recovery error:', error);
    return BackgroundFetch.Result.Failed;
  }
});

// Main location tracking task
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('🔴 Location task error:', error);
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];

    try {
      await saveLocationToFirebase(location).catch(async (error) => {
        await saveLocationOffline(location);
      });

      // Update timestamp
      lastLocationUpdate = new Date();

      // Force immediate next update
      setTimeout(getAndSaveLocation, 100);

      // Ensure forced updates are running
      if (!forcedUpdateInterval) {
        startForcedUpdates();
      }

    } catch (error) {
      await saveLocationOffline(location);
    }
  }
});

// Start location tracking
const startLocationTracking = async () => {
  try {
    // Cache auth data
    await cacheAuthData();

    // Location config with 1-minute interval
    const locationConfig = {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: LOCATION_DISTANCE_INTERVAL,
      deferredUpdatesInterval: LOCATION_UPDATE_INTERVAL,
      deferredUpdatesDistance: LOCATION_DISTANCE_INTERVAL,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: "Location Active",
        notificationBody: "Tracking location every minute",
        notificationColor: "#FF231F7C",
        killServiceOnDestroy: false
      },
      // Critical Android settings
      android: {
        startForeground: true,
        foregroundService: {
          notificationTitle: "Location Active",
          notificationBody: "Tracking location every minute",
          notificationColor: "#FF231F7C",
          killServiceOnDestroy: false
        },
        allowBackgroundLocationUpdates: true,
        backgroundUpdates: true,
        accuracyAndroid: Location.Accuracy.BALANCED,
        isStarted: true,
        enableHighAccuracy: false,
        forceRequestLocation: true,
        wakeLockTimeout: 24 * 60 * 60 * 1000,
        notification: {
          sticky: true,
          channelId: 'location',
          priority: 'default',
          visibility: 'public',
          importance: 'default',
          ongoing: true,
          icon: 'ic_launcher',
          color: true
        }
      }
    };

    // Start location updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, locationConfig);

    // Register background fetch for redundancy with 1-minute interval
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: RECOVERY_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true,
      requiresNetworking: true,
      requiresBatteryNotLow: false,
      requiresCharging: false,
      requiresDeviceIdle: false,
      requiresStorageNotLow: false
    });

    // Save state
    await saveTrackingState(true);
    isTrackingActive = true;
    lastLocationUpdate = new Date();

    // Start forced updates with 1-minute interval
    startForcedUpdates();

    console.log('📱 Location tracking started with 1-minute interval');
    return true;
  } catch (error) {
    console.error('🔴 Start error:', error);
    return false;
  }
};

// Force updates with 1-minute interval
let forcedUpdateInterval = null;

const startForcedUpdates = () => {
  if (forcedUpdateInterval) {
    clearInterval(forcedUpdateInterval);
  }

  forcedUpdateInterval = setInterval(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: LOCATION_UPDATE_INTERVAL / 2, // 30 seconds
        timeout: 10000
      });

      if (location) {
        await saveLocationToFirebase(location).catch(async (error) => {
          await saveLocationOffline(location);
        });
      }

      // Ensure tracking is still running
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (!isTracking) {
        await startLocationTracking();
      }
    } catch (error) {
      console.error('🔴 Forced update error:', error);
    }
  }, LOCATION_UPDATE_INTERVAL);
};

// Handle app state changes
const handleAppStateChange = async (nextAppState) => {
  try {
    if (nextAppState === 'background') {
      // Cache auth data and force update
      await cacheAuthData();
      
      // Force an immediate location update
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 0,
        timeout: 5000
      });
      
      if (location) {
        await saveLocationToFirebase(location);
      }

      // Ensure tracking is running
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (!isTracking) {
        await startLocationTracking();
      }

      // Ensure forced updates are running
      if (!forcedUpdateInterval) {
        startForcedUpdates();
      }
    }
  } catch (error) {
    console.error('🔴 State change error:', error);
  }
};

// Function to register background tasks
const registerBackgroundTasks = async () => {
  try {
    if (!backgroundTaskRegistered) {
      // Register background fetch
      await BackgroundFetch.registerTaskAsync(RECOVERY_TASK_NAME, {
        minimumInterval: RECOVERY_INTERVAL,
        stopOnTerminate: false,
        startOnBoot: true
      });

      backgroundTaskRegistered = true;
      console.log('✅ Background tasks registered successfully');
    }
  } catch (error) {
    console.error('🔴 Failed to register background tasks:', error);
  }
};

// Stop location tracking if needed
const stopLocationTracking = async () => {
  try {
    if (forcedUpdateInterval) {
      clearInterval(forcedUpdateInterval);
      forcedUpdateInterval = null;
    }

    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
    
    isTrackingActive = false;
    lastLocationUpdate = null;
    await saveTrackingState(false);
  } catch (error) {
    console.error('🔴 Error stopping tracking:', error);
  }
};

// Get device info for better tracking
async function getDeviceInfo() {
  return {
    manufacturer: Device.manufacturer,
    model: Device.modelName,
    osVersion: Device.osVersion,
    isDevice: Device.isDevice,
    brand: Device.brand
  };
}

// Function to ensure foreground service permissions
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
    console.error('🔴 [Permissions] Error:', error);
    throw error;
  }
};

// Function to save current user for background task
const saveCurrentUser = async () => {
  try {
    const user = firebase.auth().currentUser;
    if (user) {
      await AsyncStorage.setItem(LAST_USER_KEY, user.email);
    }
  } catch (error) {
    console.error('🔴 [Storage] Failed to save user:', error);
  }
};

// Get battery module
const BatteryManager = NativeModules.BatteryManager;
const batteryEventEmitter = new NativeEventEmitter(BatteryManager);

// Get battery status for additional context
async function getBatteryStatus() {
  try {
    if (Platform.OS === 'android') {
      // For Android
      if (!BatteryManager) {
        return null;
      }
      const level = await BatteryManager.getBatteryLevel();
      const isCharging = await BatteryManager.isCharging();
      return {
        level,
        isCharging
      };
    } else if (Platform.OS === 'ios') {
      // For iOS
      if (!BatteryManager) {
        return null;
      }
      const level = await BatteryManager.getBatteryLevel();
      const state = await BatteryManager.getBatteryState();
      return {
        level,
        isCharging: state === 'charging' || state === 'full'
      };
    }
    return null;
  } catch (error) {
    console.log('ℹ️ Battery info not available:', error.message);
    return null;
  }
}

// Initialize battery monitoring
const initializeBatteryMonitoring = () => {
  if (Platform.OS === 'ios') {
    BatteryManager?.setBatteryMonitoring?.(true);
  }
};

// Call initialization
initializeBatteryMonitoring();

// Save location to Firebase with retry mechanism
async function saveLocationToFirebase(location) {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      let userData = null;
      const currentUser = firebase.auth().currentUser;
      
      if (!currentUser) {
        const cachedData = await getCachedAuthData();
        if (!cachedData) {
          throw new Error('No authenticated user');
        }
        userData = { email: cachedData.email };
      } else {
        userData = { email: currentUser.email };
      }

      const timestamp = new Date();
      const deviceInfo = await getDeviceInfo();
      const batteryStatus = await getBatteryStatus();
      
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
        timestamp: timestamp,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        appState: AppState.currentState,
        lastUpdate: timestamp.toISOString(),
        deviceInfo: deviceInfo,
        userId: userData.email,
        isBackground: AppState.currentState === 'background'
      };

      // Only add battery info if available
      if (batteryStatus) {
        locationData.battery = batteryStatus;
      }

      // Save only current location, remove history collection
      const locationRef = db.collection('locations').doc(userData.email);
      await locationRef.set({
        currentLocation: locationData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log('📍 Location Update:', {
        time: timestamp.toLocaleString(),
        coords: {
          lat: location.coords.latitude.toFixed(6),
          lng: location.coords.longitude.toFixed(6),
          acc: Math.round(location.coords.accuracy),
          spd: Math.round(location.coords.speed || 0),
        },
        user: userData.email,
        appState: AppState.currentState,
        retryCount,
      });
      
      return true;
    } catch (error) {
      retryCount++;
      if (retryCount === maxRetries) {
        console.error('🔴 [Firebase] Failed to save location after retries:', error);
        // Save failed location to offline storage
        await saveLocationOffline({
          ...location,
          timestamp: new Date(),
          error: error.message
        });
        throw error;
      }
      console.warn(`⚠️ Retry ${retryCount}/${maxRetries} saving to Firebase:`, error);
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
    }
  }
}

// Function to save location offline
const saveLocationOffline = async (location) => {
  try {
    const offlineData = {
      ...location,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    const existingData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    const locations = existingData ? JSON.parse(existingData) : [];
    locations.push(offlineData);
    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(locations));
  } catch (error) {
    console.error('🔴 Offline save error:', error);
  }
};

// Function to sync offline locations
const syncOfflineLocations = async () => {
  try {
    const offlineData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!offlineData) return;

    const locations = JSON.parse(offlineData);
    if (locations.length === 0) return;

    for (const location of locations) {
      try {
        await saveLocationToFirebase(location);
      } catch (error) {
        console.error('🔴 Sync failed for location:', error);
        return; // Stop on first error to retry later
      }
    }

    // Clear synced locations
    await AsyncStorage.removeItem(OFFLINE_LOCATIONS_KEY);
  } catch (error) {
    console.error('🔴 Sync error:', error);
  }
};

// Check if user is authorized
const isUserAuthorized = async () => {
  try {
    const user = firebase.auth().currentUser;
    if (!user) {
      // Try to use cached auth data if in background
      if (AppState.currentState === 'background') {
        const cachedData = await getCachedAuthData();
        if (cachedData) {
          console.log('📱 Using cached auth data:', cachedData);
          return true;
        }
      }
      console.log('🚫 User not authorized: No authenticated user');
      return false;
    }

    const userDoc = await db.collection('users').doc(user.email).get();
    const userData = userDoc.data();
    const isAuthorized = userData?.role === 'staff' || userData?.role === 'admin';

    console.log('👤 User authorization check:', {
      email: user.email,
      role: userData?.role,
      isAuthorized
    });

    if (isAuthorized) {
      await cacheAuthData();
    }

    return isAuthorized;
  } catch (error) {
    console.error('🔴 Error checking user authorization:', error);
    const cachedData = await getCachedAuthData();
    if (cachedData) {
      console.log('📱 Using cached auth data as fallback:', cachedData);
      return true;
    }
    return false;
  }
};

// Function to check and manage tracking state
const checkAndManageTracking = async () => {
  if (isCheckingTracking) {
    console.log('⏳ Tracking check already in progress, skipping...');
    return;
  }
  
  isCheckingTracking = true;

  try {
    const authorized = await isUserAuthorized();
    const shouldBeTracking = authorized && await isLocationTrackingEnabled();
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    console.log('🔍 Checking tracking status:', {
      time: new Date().toLocaleString(),
      authorized,
      shouldBeTracking,
      isTracking,
      isTrackingActive,
      lastUpdate: lastLocationUpdate ? lastLocationUpdate.toLocaleString() : 'never'
    });

    if (shouldBeTracking && !isTracking) {
      console.log('🔄 Starting tracking...');
      await startLocationTracking();
    } else if (!shouldBeTracking && isTracking) {
      console.log('🛑 Stopping tracking...');
      await stopLocationTracking();
    }
  } catch (error) {
    console.error('🔴 Error managing tracking:', error);
  } finally {
    isCheckingTracking = false;
  }
};

// Initialize location tracking
const initializeLocationTracking = async () => {
  try {
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    if (foregroundStatus !== 'granted' || backgroundStatus !== 'granted') {
      throw new Error('Location permissions required');
    }

    // Check authorization
    const authorized = await isUserAuthorized();
    if (!authorized) {
      console.log('🚫 Not authorized');
      return false;
    }

    // Register tasks first
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: RECOVERY_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true
    });

    await BackgroundFetch.registerTaskAsync(RECOVERY_TASK_NAME, {
      minimumInterval: RECOVERY_INTERVAL,
      stopOnTerminate: false,
      startOnBoot: true
    });

    // Start tracking if enabled
    const wasEnabled = await isLocationTrackingEnabled();
    if (wasEnabled) {
      await startLocationTracking();
    }

    // Setup app state handler
    setupAppStateListener();

    return true;
  } catch (error) {
    console.error('🔴 Init error:', error);
    return false;
  }
};

// Export the location tracking functions
export {
  startLocationTracking,
  stopLocationTracking,
  initializeLocationTracking,
  isLocationTrackingEnabled,
  syncOfflineLocations
};