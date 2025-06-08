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
    if (cachedAuthData) return cachedAuthData;
    const data = await AsyncStorage.getItem(USER_AUTH_KEY);
    if (data) {
      cachedAuthData = JSON.parse(data);
      return cachedAuthData;
    }
  } catch (error) {}
  return null;
};

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    await getAndSaveLocation();
    return BackgroundFetch.Result.NewData;
  } catch (error) {
    return BackgroundFetch.Result.Failed;
  }
});

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
  } catch (error) {}
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

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) return;

  if (data) {
    const { locations } = data;
    const location = locations[0];

    try {
      await saveLocationToFirebase(location).catch(async (error) => {
        await saveLocationOffline(location);
      });
      lastLocationUpdate = new Date();
      setTimeout(getAndSaveLocation, 100);
      if (!forcedUpdateInterval) {
        startForcedUpdates();
      }
    } catch (error) {
      await saveLocationOffline(location);
    }
  }
});

const startLocationTracking = async () => {
  try {
    // Check authorization first
    const authorized = await isUserAuthorized();
    if (!authorized) {
      console.log('User not authorized to start location tracking');
      return false;
    }

    // Get current user data
    const userData = await getCachedAuthData();
    if (!userData || !['staff', 'admin'].includes(userData.role)) {
      console.log('Invalid user role for location tracking:', userData?.role);
      return false;
    }

    console.log('Starting location tracking for:', {
      email: userData.email,
      role: userData.role
    });

    await cacheAuthData();
    
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

    // Check if tracking is already active
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      console.log('Location tracking already active');
      return true;
    }

    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied');
      return false;
    }

    // Start location updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, locationConfig);
    
    // Register background tasks
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

    await saveTrackingState(true);
    isTrackingActive = true;
    lastLocationUpdate = new Date();
    startForcedUpdates();

    console.log('Location tracking started successfully for:', {
      email: userData.email,
      role: userData.role
    });

    return true;
  } catch (error) {
    console.error('Failed to start location tracking:', error);
    return false;
  }
};

let forcedUpdateInterval = null;

const startForcedUpdates = () => {
  if (forcedUpdateInterval) {
    clearInterval(forcedUpdateInterval);
  }

  forcedUpdateInterval = setInterval(async () => {
    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        maximumAge: LOCATION_UPDATE_INTERVAL / 2,
        timeout: 10000
      });

      if (location) {
        await saveLocationToFirebase(location).catch(async (error) => {
          await saveLocationOffline(location);
        });
      }

      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (!isTracking) {
        await startLocationTracking();
      }
    } catch (error) {}
  }, LOCATION_UPDATE_INTERVAL);
};

const handleAppStateChange = async (nextAppState) => {
  try {
    if (nextAppState === 'background') {
      await cacheAuthData();
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        maximumAge: 0,
        timeout: 5000
      });
      
      if (location) {
        await saveLocationToFirebase(location);
      }

      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (!isTracking) {
        await startLocationTracking();
      }

      if (!forcedUpdateInterval) {
        startForcedUpdates();
      }
    }
  } catch (error) {}
};

const registerBackgroundTasks = async () => {
  try {
    if (!backgroundTaskRegistered) {
      await BackgroundFetch.registerTaskAsync(RECOVERY_TASK_NAME, {
        minimumInterval: RECOVERY_INTERVAL,
        stopOnTerminate: false,
        startOnBoot: true
      });
      backgroundTaskRegistered = true;
    }
  } catch (error) {}
};

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
  } catch (error) {}
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
    const user = firebase.auth().currentUser;
    if (!user) {
      console.log('No current user found, checking cached data');
      const cachedData = await getCachedAuthData();
      if (!cachedData) {
        console.log('No cached auth data found');
        return false;
      }
      console.log('Using cached auth data:', { email: cachedData.email, role: cachedData.role });
      return ['staff', 'admin'].includes(cachedData.role);
    }

    const userDoc = await db.collection('users').doc(user.email).get();
    if (!userDoc.exists) {
      console.log('User document not found:', user.email);
      return false;
    }
    
    const userData = userDoc.data();
    if (!userData?.role) {
      console.log('User role not found:', user.email);
      return false;
    }

    const isAuthorized = ['staff', 'admin'].includes(userData.role);
    console.log('Authorization check:', { 
      email: user.email, 
      role: userData.role, 
      isAuthorized 
    });

    if (isAuthorized) {
      await cacheAuthData();
    }

    return isAuthorized;
  } catch (error) {
    console.error('Authorization check failed:', error);
    const cachedData = await getCachedAuthData();
    if (cachedData) {
      console.log('Falling back to cached auth data:', { 
        email: cachedData.email, 
        role: cachedData.role 
      });
      return ['staff', 'admin'].includes(cachedData.role);
    }
    return false;
  }
};

const checkAndManageTracking = async () => {
  if (isCheckingTracking) {
    console.log('Already checking tracking status');
    return;
  }
  
  isCheckingTracking = true;

  try {
    const authorized = await isUserAuthorized();
    console.log('Authorization status:', { authorized });

    const shouldBeTracking = authorized && await isLocationTrackingEnabled();
    console.log('Tracking status check:', { authorized, shouldBeTracking });

    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => {
        console.log('Failed to check tracking status');
        return false;
      });

    console.log('Current tracking state:', { 
      isTracking, 
      shouldBeTracking 
    });

    if (shouldBeTracking && !isTracking) {
      console.log('Starting location tracking');
      await startLocationTracking();
    } else if (!shouldBeTracking && isTracking) {
      console.log('Stopping location tracking');
      await stopLocationTracking();
    }
  } catch (error) {
    console.error('Failed to manage tracking:', error);
  } finally {
    isCheckingTracking = false;
  }
};

const saveLocationToFirebase = async (location) => {
  const maxRetries = 3;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const authorized = await isUserAuthorized();
      if (!authorized) {
        console.log('User not authorized to save location');
        return false;
      }

      let userData = null;
      const currentUser = firebase.auth().currentUser;
      
      if (!currentUser) {
        const cachedData = await getCachedAuthData();
        if (!cachedData) {
          console.log('No user data available for location save');
          return false;
        }
        userData = { email: cachedData.email, role: cachedData.role };
      } else {
        const userDoc = await db.collection('users').doc(currentUser.email).get();
        userData = { 
          email: currentUser.email, 
          role: userDoc.data()?.role 
        };
      }

      if (!['staff', 'admin'].includes(userData.role)) {
        console.log('User role not authorized for location tracking:', userData.role);
        return false;
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
        userRole: userData.role,
        isBackground: AppState.currentState === 'background'
      };

      if (batteryStatus) {
        locationData.battery = batteryStatus;
      }

      await db.collection('locations').doc(userData.email).set({
        currentLocation: locationData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('Location saved successfully:', { 
        email: userData.email,
        timestamp: timestamp.toISOString()
      });
      
      return true;
    } catch (error) {
      console.error(`Location save attempt ${retryCount + 1} failed:`, error);
      retryCount++;
      if (retryCount === maxRetries) {
        await saveLocationOffline({
          ...location,
          timestamp: new Date(),
          error: error.message
        });
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }
  return false;
};

const saveLocationOffline = async (location) => {
  try {
    const offlineData = {
      ...location,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };
    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(offlineData));
  } catch (error) {}
};

const syncOfflineLocations = async () => {
  try {
    const offlineData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!offlineData) return;

    const locationData = JSON.parse(offlineData);
    try {
      await saveLocationToFirebase(locationData);
      await AsyncStorage.removeItem(OFFLINE_LOCATIONS_KEY);
    } catch (error) {}
  } catch (error) {}
};

const initializeLocationTracking = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    if (foregroundStatus !== 'granted' || backgroundStatus !== 'granted') {
      throw new Error('Location permissions required');
    }

    const authorized = await isUserAuthorized();
    if (!authorized) {
      return false;
    }

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

    const wasEnabled = await isLocationTrackingEnabled();
    if (wasEnabled) {
      await startLocationTracking();
    }

    setupAppStateListener();

    return true;
  } catch (error) {
    return false;
  }
};

export {
  startLocationTracking,
  stopLocationTracking,
  initializeLocationTracking,
  isLocationTrackingEnabled,
  syncOfflineLocations
};