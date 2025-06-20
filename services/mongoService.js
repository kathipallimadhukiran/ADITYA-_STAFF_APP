import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import env from '../config/env';

const API_BASE_URL = env.API_BASE_URL;
const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

// Utility function to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to save location data to MongoDB
export const saveLocationToMongo = async (locationData) => {
  let retries = MAX_RETRIES;
  
  while (retries > 0) {
    try {
      const response = await axios.post(`${API_BASE_URL}/locations`, locationData);
      
      if (response.data.success) {
        // Only log if debug mode is enabled
        if (__DEV__) {
          console.log('[MongoDB] Location saved successfully');
        }
        return true;
      }
      return false;
    } catch (error) {
      retries--;
      
      if (retries === 0) {
        // Save offline on final retry failure
        await saveLocationOffline(locationData);
        return false;
      }
      
      // Wait before retrying
      await delay(RETRY_DELAY);
    }
  }
  return false;
};

// Function to save location data offline
export const saveLocationOffline = async (locationData) => {
  try {
    const existingData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    const offlineLocations = existingData ? JSON.parse(existingData) : [];
    
    // Add new location
    offlineLocations.push({
      ...locationData,
      savedAt: new Date().toISOString()
    });
    
    // Keep only last 50 locations to prevent storage issues
    if (offlineLocations.length > 50) {
      offlineLocations.shift(); // Remove oldest location
    }
    
    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(offlineLocations));
    
    // Only log in development
    if (__DEV__) {
      console.log('[MongoDB] Location saved offline');
    }
    return true;
  } catch (error) {
    if (__DEV__) {
      console.error('[MongoDB] Error saving offline:', error);
    }
    return false;
  }
};

// Function to sync offline locations
export const syncOfflineLocations = async () => {
  try {
    const existingData = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!existingData) return;

    const offlineLocations = JSON.parse(existingData);
    if (!offlineLocations.length) return;

    const successfulSyncs = [];

    for (const location of offlineLocations) {
      try {
        const response = await axios.post(`${API_BASE_URL}/locations`, location);
        if (response.data.success) {
          successfulSyncs.push(location);
        }
      } catch (error) {
        // Skip failed location and continue with others
        continue;
      }
    }

    // Remove successfully synced locations
    if (successfulSyncs.length > 0) {
      const remainingLocations = offlineLocations.filter(
        loc => !successfulSyncs.find(
          synced => synced.timestamp === loc.timestamp
        )
      );
      await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(remainingLocations));
    }

    // Only log in development
    if (__DEV__) {
      console.log(`[MongoDB] Synced ${successfulSyncs.length} offline locations`);
    }
  } catch (error) {
    if (__DEV__) {
      console.error('[MongoDB] Error syncing offline locations:', error);
    }
  }
};

// Function to clear offline locations
export const clearOfflineLocations = async () => {
  try {
    await AsyncStorage.removeItem(OFFLINE_LOCATIONS_KEY);
    return true;
  } catch (error) {
    return false;
  }
};

export const getLastLocation = async (userId) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/locations/last/${userId}`);
    return response.data;
  } catch (error) {
    console.error('[MongoDB] Error getting last location:', error);
    return null;
  }
};

export const getUserLocations = async (userId, startDate, endDate) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/locations/${userId}`, {
      params: { startDate, endDate }
    });
    return response.data;
  } catch (error) {
    console.error('[MongoDB] Error getting user locations:', error);
    return [];
  }
}; 