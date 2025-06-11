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
const LOCATION_UPDATE_INTERVAL = 120000; // 1 minute
const RECOVERY_INTERVAL = 120000; // 1 minute
const LOCATION_DISTANCE_INTERVAL = 5; // Update every 5 meters
const BACKGROUND_UPDATE_INTERVAL = 120000; // 1 minute
const BACKGROUND_DISTANCE_INTERVAL = 5; // Update every 5 meters
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 10000; // 1 second debounce for state changes
const SETTINGS_REFRESH_INTERVAL = 5* 60* 1000; // 30 minutes in milliseconds
const SETTINGS_CACHE_KEY = '@attendance_settings_cache';

// Track active state
let isTrackingActive = false;
let lastLocationUpdate = null;
let cachedAuthData = null;
let isCheckingTracking = false;
let lastAppState = AppState.currentState;
let lastStateChangeTime = Date.now();
let stateChangeTimeout = null;
let backgroundTaskRegistered = false;
let settingsRefreshInterval = null;

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
  if (error) {
    console.log('[DEBUG] Error in location task:', error);
    await stopLocationTracking();
    return;
  }

  if (data) {
    const { locations } = data;
    const location = locations[0];

    try {
      // Check working hours first
      const workingHoursCheck = await checkWorkingHours();
      if (!workingHoursCheck || !workingHoursCheck.isWithinWorkingHours) {
        console.log('[DEBUG] Outside working hours, stopping tracking');
        await stopLocationTracking();
        return;
      }

      // Get current user data
      const userData = await getCachedAuthData();
      if (!userData) {
        console.log('[DEBUG] No user data available');
        await stopLocationTracking();
        return;
      }

      // Save location if all checks pass
      await saveLocationToFirebase(location);
      lastLocationUpdate = new Date();
    } catch (error) {
      console.error('[DEBUG] Error in background task:', error);
      await stopLocationTracking();
    }
  }
});

const cacheSettings = async (settings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify({
      settings,
      timestamp: Date.now()
    }));
    console.log('[DEBUG] Settings cached successfully');
  } catch (error) {
    console.error('[DEBUG] Error caching settings:', error);
  }
};

const getCachedSettings = async () => {
  try {
    const cached = await AsyncStorage.getItem(SETTINGS_CACHE_KEY);
    if (cached) {
      const { settings, timestamp } = JSON.parse(cached);
      // Return cached settings if they're less than 30 minutes old
      if (Date.now() - timestamp < SETTINGS_REFRESH_INTERVAL) {
        console.log('[DEBUG] Using cached settings');
        return settings;
      }
    }
  } catch (error) {
    console.error('[DEBUG] Error reading cached settings:', error);
  }
  return null;
};

const fetchSettings = async () => {
  try {
    console.log('[DEBUG] Fetching fresh settings from Firebase');
    const settingsDoc = await db.collection('settings').doc('attendance').get();
    if (!settingsDoc.exists) {
      console.log('[DEBUG] Settings document not found');
      return null;
    }
    const settings = settingsDoc.data();
    await cacheSettings(settings);
    return settings;
  } catch (error) {
    console.error('[DEBUG] Error fetching settings:', error);
    return null;
  }
};

const startSettingsRefresh = () => {
  if (settingsRefreshInterval) {
    clearInterval(settingsRefreshInterval);
  }
  
  // Immediately fetch settings
  fetchSettings();
  
  // Set up periodic refresh
  settingsRefreshInterval = setInterval(async () => {
    console.log('[DEBUG] Refreshing settings from Firebase');
    const settings = await fetchSettings();
    if (settings) {
      // If tracking is active, recheck working hours with new settings
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (isTracking) {
        console.log('[DEBUG] Rechecking working hours with updated settings');
        const workingHoursCheck = await checkWorkingHours();
        if (!workingHoursCheck || !workingHoursCheck.isWithinWorkingHours) {
          console.log('[DEBUG] Outside working hours with new settings, stopping tracking');
          await stopLocationTracking();
        }
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

const checkWorkingHours = async () => {
  try {
    // Get current time and day
    const now = new Date();
    const currentDay = now.toLocaleString('default', { weekday: 'long' });
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const todayStr = now.toISOString().split('T')[0];

    console.log('[DEBUG] Checking working hours:', {
      currentTime: `${currentHour}:${currentMinute}`,
      day: currentDay,
      date: todayStr
    });

    // Try to get cached settings first
    let settings = await getCachedSettings();
    if (!settings) {
      settings = await fetchSettings();
    }

    if (!settings) {
      console.log('[DEBUG] Could not get settings');
      return false;
    }

    console.log('[DEBUG] Using settings:', settings);

    // Check if it's a working day
    const daySettings = settings.workingDays?.[currentDay];
    if (!daySettings || !daySettings.isWorking) {
      console.log(`[DEBUG] ${currentDay} is not a working day`);
      return false;
    }

    // Check if it's a holiday
    const isHoliday = settings.holidays?.some(holiday => holiday.date === todayStr);
    if (isHoliday) {
      console.log('[DEBUG] Today is a holiday');
      return false;
    }

    // Parse start and end times
    const [startHour, startMinute] = (daySettings.startTime || "00:00").split(':').map(Number);
    const [endHour, endMinute] = (daySettings.endTime || "23:59").split(':').map(Number);

    const currentTimeInMinutes = (currentHour * 60) + currentMinute;
    const startTimeInMinutes = (startHour * 60) + startMinute;
    const endTimeInMinutes = (endHour * 60) + endMinute;

    console.log('[DEBUG] Time comparison:', {
      current: `${currentHour}:${currentMinute}`,
      start: daySettings.startTime,
      end: daySettings.endTime,
      currentMinutes: currentTimeInMinutes,
      startMinutes: startTimeInMinutes,
      endMinutes: endTimeInMinutes
    });

    const isWithinWorkingHours = currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes;

    console.log('[DEBUG] Working hours check result:', {
      isWithinWorkingHours,
      startTime: daySettings.startTime,
      endTime: daySettings.endTime,
      currentTime: `${currentHour}:${currentMinute}`
    });

    return {
      isWithinWorkingHours,
      daySettings,
      settings,
      timeInfo: {
        currentTimeInMinutes,
        startTimeInMinutes,
        endTimeInMinutes
      }
    };
  } catch (error) {
    console.error('[DEBUG] Error checking working hours:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    return false;
  }
};

const startLocationTracking = async () => {
  try {
    // Check authorization first
    const authorized = await isUserAuthorized();
    if (!authorized) {
      console.log('[DEBUG] User not authorized to start location tracking');
      return false;
    }

    // Get current user data
    const userData = await getCachedAuthData();
    if (!userData || !['staff', 'faculty', 'admin'].includes(userData.role)) {
      console.log('[DEBUG] Invalid user role for location tracking:', userData?.role);
      return false;
    }

    // Check working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck || !workingHoursCheck.isWithinWorkingHours) {
      console.log('[DEBUG] Outside working hours, cannot start tracking');
      await stopLocationTracking();
      return false;
    }

    const { daySettings } = workingHoursCheck;

    // Calculate time values for wake lock
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const [endHour, endMinute] = daySettings.endTime.split(':').map(Number);
    
    const currentTimeMinutes = (currentHour * 60) + currentMinute;
    const endTimeMinutes = (endHour * 60) + endMinute;
    
    const remainingMinutes = endTimeMinutes - currentTimeMinutes;
    const wakeLockTimeout = Math.max(remainingMinutes * 60 * 1000, 60000); // At least 1 minute

    // Start location updates with settings from Firebase
    const locationConfig = {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: LOCATION_DISTANCE_INTERVAL,
      showsBackgroundLocationIndicator: true,
      activityType: Location.ActivityType.OtherNavigation,
      foregroundService: {
        notificationTitle: "Location Active",
        notificationBody: `Tracking until ${daySettings.endTime}`,
        notificationColor: "#FF231F7C",
        killServiceOnDestroy: true
      },
      android: {
        startForeground: true,
        foregroundService: {
          notificationTitle: "Location Active",
          notificationBody: `Tracking until ${daySettings.endTime}`,
          notificationColor: "#FF231F7C",
          killServiceOnDestroy: true
        },
        allowBackgroundLocationUpdates: true,
        backgroundUpdates: true,
        accuracyAndroid: Location.Accuracy.BALANCED,
        isStarted: true,
        enableHighAccuracy: false,
        forceRequestLocation: true,
        wakeLockTimeout: wakeLockTimeout,
        notification: {
          sticky: true,
          channelId: 'location',
          priority: 'high',
          visibility: 'public',
          importance: 'high',
          ongoing: true,
          icon: 'ic_launcher',
          color: true
        }
      }
    };

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, locationConfig);
    await saveTrackingState(true);
    isTrackingActive = true;
    lastLocationUpdate = new Date();

    console.log('[DEBUG] Location tracking started with settings:', {
      startTime: daySettings.startTime,
      endTime: daySettings.endTime,
      role: userData.role,
      wakeLockTimeout: Math.round(wakeLockTimeout / 60000) + ' minutes'
    });

    return true;
  } catch (error) {
    console.error('[DEBUG] Error starting location tracking:', error);
    await stopLocationTracking();
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

    // Stop settings refresh
    stopSettingsRefresh();

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
      return ['staff', 'faculty', 'admin'].includes(cachedData.role);
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

    const isAuthorized = ['staff', 'faculty', 'admin'].includes(userData.role);
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
      return ['staff', 'faculty', 'admin'].includes(cachedData.role);
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

      if (!['staff', 'faculty', 'admin'].includes(userData.role)) {
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
    console.log('[DEBUG] Initializing location tracking...');
    
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();

    if (foregroundStatus !== 'granted' || backgroundStatus !== 'granted') {
      console.log('[DEBUG] Location permissions not granted:', { foregroundStatus, backgroundStatus });
      throw new Error('Location permissions required');
    }

    // Start settings refresh
    startSettingsRefresh();

    console.log('[DEBUG] Location permissions granted, checking authorization...');
    const authorized = await isUserAuthorized();
    console.log('[DEBUG] Authorization check result:', { authorized });
    
    if (!authorized) {
      console.log('[DEBUG] User not authorized for location tracking');
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
    console.error('[DEBUG] Failed to initialize location tracking:', error);
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