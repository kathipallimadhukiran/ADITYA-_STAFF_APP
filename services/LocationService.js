import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import * as BackgroundTask from 'expo-background-task';
import { Platform, AppState, NativeEventEmitter, NativeModules, Alert, Linking } from 'react-native';
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
const LOCATION_UPDATE_INTERVAL = 15 * 1000; // 15 seconds
const RECOVERY_INTERVAL = 15 * 1000; // 15 seconds
const LOCATION_DISTANCE_INTERVAL = 0; // Remove distance interval to ensure time-based updates
const BACKGROUND_UPDATE_INTERVAL = 15000; // 15 seconds
const BACKGROUND_DISTANCE_INTERVAL = 0; // Remove distance interval
const TRACKING_ENABLED_KEY = '@location_tracking_enabled';
const LAST_USER_KEY = '@last_user_email';
const USER_AUTH_KEY = '@user_auth_data';
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const STATE_CHANGE_DEBOUNCE = 15000; // 15 second debounce for state changes
const SETTINGS_REFRESH_INTERVAL =   1000; // 30 minutes in milliseconds
const SETTINGS_CACHE_KEY = '@attendance_settings_cache';
const USER_DATA_CACHE_KEY = '@user_data_cache';
const USER_DATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    // First check if we have valid cached data
    if (cachedAuthData) {
      console.log('[DEBUG] Using in-memory cached auth data');
      return cachedAuthData;
    }

    // If no in-memory cache, try to get from AsyncStorage
    const data = await AsyncStorage.getItem(USER_AUTH_KEY);
    if (data) {
      try {
        const parsedData = JSON.parse(data);
        // Validate the cached data
        if (parsedData && parsedData.email && parsedData.role) {
          console.log('[DEBUG] Using AsyncStorage cached auth data');
          cachedAuthData = parsedData;
          return parsedData;
        }
      } catch (e) {
        console.log('[DEBUG] Error parsing cached auth data:', e);
      }
    }

    // If no valid cached data, try to get fresh data
    const user = firebase.auth().currentUser;
    if (user) {
      console.log('[DEBUG] Fetching fresh auth data for user:', user.email);
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

    console.log('[DEBUG] No valid auth data available');
    return null;
  } catch (error) {
    console.error('[DEBUG] Error in getCachedAuthData:', error);
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
      if (!workingHoursCheck.isWithinWorkingHours) {
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
      console.log('[DEBUG] Location updated:', new Date().toISOString());
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
        if (!workingHoursCheck.isWithinWorkingHours) {
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

const getUserData = async () => {
  try {
    // Try to get cached data first
    const cachedData = await AsyncStorage.getItem(USER_DATA_CACHE_KEY);
    if (cachedData) {
      const { data, timestamp } = JSON.parse(cachedData);
      if (Date.now() - timestamp < USER_DATA_CACHE_DURATION) {
        console.log('[DEBUG] Using cached user data:', data);
        return data;
      }
    }

    // If no cache or expired, fetch from Firestore
    const auth = getAuth();
    const user = auth.currentUser;
    
    if (!user) {
      console.log('[DEBUG] No user logged in');
      return null;
    }

    console.log('[DEBUG] Fetching data for user:', user.uid);
    const db = getFirestore();
    
    // Get settings from settings collection
    const settingsDocRef = doc(db, 'settings', 'attendance');
    const settingsDoc = await getDoc(settingsDocRef);
    
    if (!settingsDoc.exists()) {
      console.log('[DEBUG] No settings document found');
      return null;
    }

    const settingsData = settingsDoc.data();
    console.log('[DEBUG] Retrieved settings:', settingsData);

    // Get current day
    const now = new Date();
    const currentDay = now.toLocaleString('default', { weekday: 'long' });
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const todayStr = now.toISOString().split('T')[0];

    console.log('[DEBUG] Checking working hours:', {
      currentTime: `${currentHour}:${currentMinute}`,
      date: todayStr,
      day: currentDay
    });

    // Check if it's a working day
    const daySettings = settingsData.workingDays?.[currentDay];
    if (!daySettings || !daySettings.isWorking) {
      console.log(`[DEBUG] ${currentDay} is not a working day`);
      return null;
    }

    // Check if it's a holiday
    const isHoliday = settingsData.holidays?.some(holiday => holiday.date === todayStr);
    if (isHoliday) {
      console.log('[DEBUG] Today is a holiday');
      return null;
    }

    const workingHours = {
      startTime: daySettings.startTime,
      endTime: daySettings.endTime
    };

    // Cache the data
    await AsyncStorage.setItem(USER_DATA_CACHE_KEY, JSON.stringify({
      data: { workingHours },
      timestamp: Date.now()
    }));

    return { workingHours };
  } catch (error) {
    console.error('[DEBUG] Error getting user data:', error);
    return null;
  }
};

const checkWorkingHours = async () => {
  try {
    const userData = await getUserData();
    console.log('[DEBUG] User data in checkWorkingHours:', userData);

    if (!userData || !userData.workingHours) {
      console.log('[DEBUG] No working hours data available');
      return { isWithinWorkingHours: false };
    }

    const { startTime, endTime } = userData.workingHours;
    const currentTime = new Date();
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    const currentTimeString = `${currentHour}:${currentMinute}`;

    // Convert times to minutes for easier comparison
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const currentMinutes = currentHour * 60 + currentMinute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    console.log('[DEBUG] Time comparison:', {
      current: currentTimeString,
      currentMinutes,
      start: startTime,
      startMinutes,
      end: endTime,
      endMinutes
    });

    const isWithinWorkingHours = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    
    console.log('[DEBUG] Working hours check result:', {
      currentTime: currentTimeString,
      startTime,
      endTime,
      isWithinWorkingHours
    });

    return { isWithinWorkingHours };
  } catch (error) {
    console.error('[DEBUG] Error checking working hours:', error);
    return { isWithinWorkingHours: false };
  }
};

const isLocationServicesEnabled = async () => {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    return enabled;
  } catch (error) {
    console.error('[DEBUG] Error checking location services:', error);
    return false;
  }
};

const startLocationTracking = async () => {
  try {
    console.log('[DEBUG] Starting location tracking...');
    
    // Check if tracking is already active
    const isTrackingActive = await AsyncStorage.getItem('isTrackingActive');
    if (isTrackingActive === 'true') {
      console.log('[DEBUG] Location tracking is already active');
      return;
    }

    // Get user data first
    const userData = await getCachedAuthData();
    if (!userData) {
      console.log('[DEBUG] No user data available, cannot start tracking');
      return;
    }

    // Check if user is logged in
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      console.log('[DEBUG] No user logged in, cannot start tracking');
      Alert.alert('Error', 'Please log in to start location tracking');
      return;
    }

    // Check if within working hours
    const workingHoursCheck = await checkWorkingHours();
    if (!workingHoursCheck.isWithinWorkingHours) {
      console.log('[DEBUG] Outside working hours, not starting location tracking');
      Alert.alert('Notice', 'Location tracking is only available during your working hours');
      return;
    }

    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Foreground location permission denied');
      Alert.alert(
        'Location Permission Required',
        'Please enable location access in settings to track attendance.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Background location permission denied');
      Alert.alert(
        'Background Location Required',
        'Please enable background location access in settings to track attendance when app is closed.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]
      );
      return;
    }

    // Set tracking as active before starting location updates
    await AsyncStorage.setItem('isTrackingActive', 'true');

    // Start location updates with foreground service
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: LOCATION_UPDATE_INTERVAL,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: 'Location Tracking Active',
        notificationBody: 'Tracking your location for attendance',
        notificationColor: '#4CAF50',
      },
      // Android specific settings
      ...(Platform.OS === 'android' && {
        foregroundService: {
          notificationTitle: 'Location Tracking Active',
          notificationBody: 'Tracking your location for attendance',
          notificationColor: '#4CAF50',
          killServiceOnDestroy: false,
          startOnBoot: true,
          restartOnKill: true,
          notification: {
            sticky: true,
            ongoing: true,
            autoCancel: false,
            importance: 'high',
            priority: 'max',
            channelId: 'location-tracking',
            showWhen: true,
            visibility: 'public',
            color: '#4CAF50',
            icon: 'ic_notification',
            actions: [],
          },
        },
      }),
    });

    console.log('[DEBUG] Location tracking started successfully');

    // Start recovery check
    startRecoveryCheck();

  } catch (error) {
    console.error('[DEBUG] Error starting location tracking:', error);
    // Reset tracking state if there was an error
    await AsyncStorage.setItem('isTrackingActive', 'false');
    Alert.alert('Error', 'Failed to start location tracking. Please try again.');
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

    if (nextAppState === 'active' && lastAppState.match(/inactive|background/)) {
      console.log('[DEBUG] App came to foreground');
      await checkAndRestartTracking();
    } else if (nextAppState.match(/inactive|background/) && lastAppState === 'active') {
      console.log('[DEBUG] App went to background');
      await checkAndRestartTracking();
    }

    lastAppState = nextAppState;
  } catch (error) {
    console.error('[DEBUG] Error in app state change:', error);
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
            console.log('[DEBUG] Recovery task detected tracking stopped, restarting...');
            await startLocationTracking();
          }
          return BackgroundFetch.Result.NewData;
        } catch (error) {
          console.error('[DEBUG] Error in recovery task:', error);
          return BackgroundFetch.Result.Failed;
        }
      });
      backgroundTaskRegistered = true;
    }
  } catch (error) {}
};

const stopLocationTracking = async () => {
  try {
    if (!isTrackingActive) {
      return;
    }

    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await TaskManager.unregisterTaskAsync(RECOVERY_TASK_NAME);

    isTrackingActive = false;
    await saveTrackingState(false);
    console.log('[DEBUG] Location tracking stopped successfully');
  } catch (error) {
    console.error('[DEBUG] Error stopping location tracking:', error);
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
      // Get user data from cache first (faster and works in background)
      const cachedData = await getCachedAuthData();
      if (!cachedData) {
        console.log('[DEBUG] No cached user data available');
        return false;
      }

      const timestamp = new Date();
      const locationData = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        speed: location.coords.speed || 0,
        heading: location.coords.heading || 0,
        timestamp: timestamp,
        lastUpdate: timestamp.toISOString(),
        userId: cachedData.email,
        userRole: cachedData.role,
        isBackground: AppState.currentState === 'background'
      };

      // Use set with merge to ensure we don't lose data
      await db.collection('locations').doc(cachedData.email).set({
        currentLocation: locationData,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log('[DEBUG] Location saved successfully:', { 
        email: cachedData.email,
        timestamp: timestamp.toISOString(),
        isBackground: locationData.isBackground
      });
      
      return true;
    } catch (error) {
      console.error(`[DEBUG] Location save attempt ${retryCount + 1} failed:`, error);
      retryCount++;
      if (retryCount === maxRetries) {
        // Save to offline storage if all retries fail
        await saveLocationOffline({
          ...location,
          timestamp: new Date(),
          error: error.message
        });
        return false;
      }
      // Exponential backoff for retries
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
    }
  }
  return false;
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
    console.log('[DEBUG] Location saved offline:', { 
      email: cachedData.email,
      timestamp: offlineData.timestamp
    });
  } catch (error) {
    console.error('[DEBUG] Error saving location offline:', error);
  }
};

const syncOfflineLocations = async () => {
  try {
    const offlineData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!offlineData) return;

    const offlineLocations = JSON.parse(offlineData);
    if (!Array.isArray(offlineLocations)) return;

    console.log('[DEBUG] Syncing offline locations:', offlineLocations.length);

    for (const location of offlineLocations) {
      try {
        await saveLocationToFirebase(location);
        // Remove synced location
        offlineLocations.shift();
        await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(offlineLocations));
      } catch (error) {
        console.error('[DEBUG] Error syncing location:', error);
        break; // Stop on first error to prevent data loss
      }
    }
  } catch (error) {
    console.error('[DEBUG] Error in syncOfflineLocations:', error);
  }
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

    await TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
      try {
        const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
          .catch(() => false);

        if (!isTracking) {
          console.log('[DEBUG] Recovery task detected tracking stopped, restarting...');
          await startLocationTracking();
        }
        return BackgroundFetch.Result.NewData;
      } catch (error) {
        console.error('[DEBUG] Error in recovery task:', error);
        return BackgroundFetch.Result.Failed;
      }
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

// Add a new function to check and restart tracking if needed
const checkAndRestartTracking = async () => {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false);

    if (!isTracking) {
      console.log('[DEBUG] Tracking not active, restarting...');
      await startLocationTracking();
    }
  } catch (error) {
    console.error('[DEBUG] Error checking tracking status:', error);
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
    console.error('[DEBUG] Error ensuring tracking is active:', error);
  }
};

// Add a new function to handle app termination
const handleAppTermination = async () => {
  try {
    console.log('[DEBUG] App is being terminated, ensuring tracking continues...');
    await checkAndRestartTracking();
  } catch (error) {
    console.error('[DEBUG] Error handling app termination:', error);
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

export {
  startLocationTracking,
  stopLocationTracking,
  initializeLocationTracking,
  isLocationTrackingEnabled,
  syncOfflineLocations,
  setupTerminationListener
};