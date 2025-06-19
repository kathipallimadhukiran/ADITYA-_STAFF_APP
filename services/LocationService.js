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

// Constants
const LOCATION_TASK_NAME = 'background-location-task';
const RECOVERY_TASK_NAME = 'location-recovery-task';
const BACKGROUND_FETCH_TASK = 'background-fetch-task';
const LOCATION_UPDATE_INTERVAL = 20000; // 20 seconds
const RECOVERY_INTERVAL = 20000; // 20 seconds
const LOCATION_DISTANCE_INTERVAL = 0; // Remove distance interval to ensure time-based updates
const BACKGROUND_UPDATE_INTERVAL = 20000; // 20 seconds
const BACKGROUND_DISTANCE_INTERVAL = 0; // Remove distance interval
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 20000; // 20 second debounce for state changes
const SETTINGS_REFRESH_INTERVAL = 20000; // 20 seconds
const SETTINGS_CACHE_KEY = '@attendance_settings_cache';
const USER_DATA_CACHE_KEY = '@user_data_cache';
const USER_DATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const LOCATION_PERMISSION_STATUS = '@location_permission_status';
const WORKING_HOURS_CHECK_INTERVAL = 20000; // 20 seconds
const TRACKING_STATE_KEY = '@location_tracking_state';

// Track active state
let _isTrackingActive = false;
let lastLocationUpdate = null;
let cachedAuthData = null;

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

const getAndSaveLocation = async () => {
  try {
    // Check working hours first
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      return;
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      maximumAge: 0,
      timeout: 5000
    });
    
    // Validate location object
    if (!location || !location.coords || !location.coords.latitude || !location.coords.longitude) {
      return;
    }

    try {
      await saveLocationToFirebase(location);
    } catch (error) {
      // Save to offline storage as backup
      await saveLocationOffline(location);
    }
  } catch (error) {
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

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    return;
  }

  // Check working hours first before processing any locations
  const workingHoursCheck = await checkWorkingHours();
  if (!workingHoursCheck.isWithinWorkingHours) {
    await stopLocationTracking();
    return;
  }

  if (data) {
    const { locations } = data;
    if (!locations || locations.length === 0) return;

    try {
      // Get user data
      const userData = await getCachedAuthData();
      if (!userData) return;

      // Get device info
      const deviceInfo = await getDeviceInfo();

      // Process locations only if we're within working hours
      for (const location of locations) {
        const locationData = {
          accuracy: location.coords.accuracy,
          altitude: location.coords.altitude,
          appState: AppState.currentState,
          createdAt: new Date().toISOString(),
          deviceInfo: {
            brand: deviceInfo.brand || "",
            isDevice: deviceInfo.isDevice,
            manufacturer: deviceInfo.manufacturer || "",
            model: deviceInfo.model || "",
            osVersion: deviceInfo.osVersion || "",
          },
          heading: location.coords.heading || 0,
          isBackground: AppState.currentState !== 'active',
          lastUpdate: new Date().toISOString(),
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed || 0,
          timestamp: new Date().toISOString(),
          userId: userData.email,
          userRole: userData.role
        };

        const saved = await saveLocationToFirebase(locationData);
        if (!saved) {
          await stopLocationTracking();
          return;
        }
      }
    } catch (error) {
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

const checkWorkingHours = async (forceFresh = false) => {
  try {
    const userData = forceFresh ? 
      await getUserData(true) : 
      await getUserData();

    if (!userData?.workingHours?.startTime || !userData?.workingHours?.endTime) {
      return { isWithinWorkingHours: false };
    }

    const { startTime, endTime } = userData.workingHours;

    if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) {
      return { isWithinWorkingHours: false };
    }

    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();

    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    let endMinutes = endHour * 60 + endMinute;

    if (!userData.workingHours.isWorkingDay) {
      lastWorkingHoursCheck = { isWorkingDay: false, isWithinWorkingHours: false };
      return { isWithinWorkingHours: false };
    }

    let adjustedCurrentMinutes = currentMinutes;
    if (endHour >= 24) {
      endMinutes = (endHour - 24) * 60 + endMinute;
      if (currentHour < 12) {
        adjustedCurrentMinutes = currentMinutes;
      } else {
        endMinutes += 24 * 60;
      }
    }

    const isWithinWorkingHours = 
      adjustedCurrentMinutes >= startMinutes && 
      adjustedCurrentMinutes <= endMinutes;

    if (lastWorkingHoursCheck?.isWithinWorkingHours !== isWithinWorkingHours) {
      if (!isWithinWorkingHours) {
        await stopLocationTracking();
        if (settingsRefreshInterval) {
          clearInterval(settingsRefreshInterval);
          settingsRefreshInterval = null;
        }
        if (locationCheckInterval) {
          clearInterval(locationCheckInterval);
          locationCheckInterval = null;
        }
        if (recoveryCheckInterval) {
          clearInterval(recoveryCheckInterval);
          recoveryCheckInterval = null;
        }
        if (workingHoursCheckInterval) {
          clearInterval(workingHoursCheckInterval);
          workingHoursCheckInterval = null;
        }
      }
    }

    lastWorkingHoursCheck = { isWorkingDay: true, isWithinWorkingHours };
    return { isWithinWorkingHours };
  } catch (error) {
    console.error('[ERROR] Error checking working hours:', error);
    return { isWithinWorkingHours: false };
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
    // Check if tracking is already active to prevent multiple starts
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTracking) {
      return;
    }

    // Check if we're within working hours first
    const workingHoursCheck = await checkWorkingHours(true);
    if (!workingHoursCheck.isWithinWorkingHours) {
      await stopLocationTracking();
      return;
    }

    // Check location permissions
    const permissionStatus = await getLocationPermissionStatus();
    if (!permissionStatus.allGranted) {
      await AsyncStorage.setItem('isTrackingActive', 'false');
      return;
    }

    // Get user data
    const userData = await getCachedAuthData();
    if (!userData) {
      return;
    }

    // Double check if tracking hasn't started while we were checking permissions
    const isTrackingNow = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);
    
    if (isTrackingNow) {
      return;
    }

    // Set tracking as active
    await setTrackingActive(true);

    // Start location updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: 0,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: 'Location Tracking Active',
        notificationBody: 'Tracking your location for attendance',
        notificationColor: '#4CAF50',
      }
    });
  } catch (error) {
    console.error('[ERROR] Failed to start tracking:', error);
    await stopLocationTracking();
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
    const isAuthorizedRole = ['staff', 'admin'].includes(role);
    
    if (!isAuthorizedRole) {
      await stopLocationTracking();
      return false;
    }

    return true;
  } catch (error) {
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

const saveLocationToFirebase = async (location) => {
  try {
    const workingHoursCheck = await checkWorkingHours(true);
    if (!workingHoursCheck.isWithinWorkingHours) {
      await stopLocationTracking();
      if (settingsRefreshInterval) {
        clearInterval(settingsRefreshInterval);
        settingsRefreshInterval = null;
      }
      if (locationCheckInterval) {
        clearInterval(locationCheckInterval);
        locationCheckInterval = null;
      }
      if (recoveryCheckInterval) {
        clearInterval(recoveryCheckInterval);
        recoveryCheckInterval = null;
      }
      if (workingHoursCheckInterval) {
        clearInterval(workingHoursCheckInterval);
        workingHoursCheckInterval = null;
      }
      return false;
    }

    const userData = await getCachedAuthData();
    if (!userData?.email) {
      return false;
    }

    const now = new Date();
    const locationTime = new Date(location.timestamp || Date.now());
    const timeDiff = Math.abs(now - locationTime);
    
    if (timeDiff > 60000) {
      return false;
    }

    const settings = await fetchSettings();
    if (!settings?.workingHours) {
      await stopLocationTracking();
      return false;
    }

    const { startTime, endTime } = settings.workingHours;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    let endMinutes = endHour * 60 + endMinute;

    if (endHour >= 24) {
      endMinutes = (endHour - 24) * 60 + endMinute;
      if (currentHour < 12) {
      } else {
        endMinutes += 24 * 60;
      }
    }

    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
      await stopLocationTracking();
      return false;
    }

    const deviceInfo = await getDeviceInfo();
    const coords = location.coords || location;
    const latitude = coords.latitude || location.latitude;
    const longitude = coords.longitude || location.longitude;
    
    if (!latitude || !longitude) {
      return false;
    }
    
    const locationData = {
      accuracy: coords.accuracy || location.accuracy || 0,
      altitude: coords.altitude || location.altitude || 0,
      appState: AppState.currentState,
      createdAt: new Date().toISOString(),
      deviceInfo: {
        brand: deviceInfo.brand || "",
        isDevice: deviceInfo.isDevice || true,
        manufacturer: deviceInfo.manufacturer || "",
        model: deviceInfo.model || "",
        osVersion: deviceInfo.osVersion || "",
      },
      heading: coords.heading || location.heading || 0,
      isBackground: AppState.currentState !== 'active',
      lastUpdate: new Date().toISOString(),
      latitude: latitude,
      longitude: longitude,
      speed: coords.speed || location.speed || 0,
      timestamp: new Date(location.timestamp || Date.now()).toISOString(),
      userId: userData.email.toLowerCase(),
      userRole: userData.role || 'staff'
    };

    const userEmail = userData.email.toLowerCase();
    await db.collection('locations')
      .doc(userEmail)
      .set({
        currentLocation: locationData,
        lastUpdate: new Date().toISOString(),
        lastLocationTimestamp: new Date().getTime()
      }, { merge: true });
      
    return true;
  } catch (error) {
    console.error('[ERROR] Error saving location:', error);
    await saveLocationOffline(location);
    return false;
  }
};

const saveLocationOffline = async (location) => {
  try {
    const cachedData = await getCachedAuthData();
    if (!cachedData) return;

    const offlineData = {
      ...location,
      userId: cachedData.email,
      userRole: cachedData.role,
      timestamp: new Date().toISOString(),
      savedAt: new Date().toISOString()
    };

    // Get existing offline data
    const existingData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    let offlineLocations = [];
    
    if (existingData) {
      try {
        offlineLocations = JSON.parse(existingData);
        if (!Array.isArray(offlineLocations)) {
          offlineLocations = [];
        }
      } catch (e) {
        offlineLocations = [];
      }
    }

    // Add new location and keep only last 100 locations
    offlineLocations.push(offlineData);
    if (offlineLocations.length > 100) {
      offlineLocations = offlineLocations.slice(-100);
    }

    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(offlineLocations));
  } catch (error) {
  }
};

const syncOfflineLocations = async () => {
  try {
    const offlineData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!offlineData) return;

    const offlineLocations = JSON.parse(offlineData);
    if (!Array.isArray(offlineLocations)) return;

    for (const location of offlineLocations) {
      try {
        await saveLocationToFirebase(location);
        // Remove synced location
        offlineLocations.shift();
        await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(offlineLocations));
      } catch (error) {
        break; // Stop on first error to prevent data loss
      }
    }
  } catch (error) {
  }
};

// Update monitorLocationServices to use the new status system
const monitorLocationServices = async () => {
  if (locationCheckInterval) {
    clearInterval(locationCheckInterval);
  }

  const checkLocationStatus = async () => {
    try {
      const status = await getLocationPermissionStatus();
      await updateLocationPermissionStatus(status);

      if (!status.allGranted) {
        // Stop any active tracking since location is not fully enabled/permitted
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);
        if (isTracking) {
          await stopLocationTracking();
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
    }
  };

  // Check immediately
  await checkLocationStatus();
  
  // Then check frequently (every 1 second)
  locationCheckInterval = setInterval(checkLocationStatus, 1000);

  // Add event listener for location changes if available
  if (Platform.OS === 'android' && NativeModules.LocationServicesModule) {
    locationPermissionEmitter.addListener('locationServicesStatusChange', () => {
      checkLocationStatus();
    });
  }
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

  workingHoursCheckInterval = setInterval(async () => {
    try {
      const workingHoursCheck = await checkWorkingHours(true);
      const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
        .catch(() => false);
      
      if (workingHoursCheck.isWithinWorkingHours !== lastWorkingHoursState || 
          isTracking !== lastTrackingState) {
        
        lastWorkingHoursState = workingHoursCheck.isWithinWorkingHours;
        lastTrackingState = isTracking;
        
        if (!workingHoursCheck.isWithinWorkingHours) {
          await stopLocationTracking();
        } else if (!isTracking) {
          await startLocationTracking();
        }
      }
    } catch (error) {
      console.error('[ERROR] Error in working hours check:', error);
    }
  }, WORKING_HOURS_CHECK_INTERVAL);
};

// Start the working hours check when the module loads
startWorkingHoursCheck();

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
  locationPermissionEmitter
};