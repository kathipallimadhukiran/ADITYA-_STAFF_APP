import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS } from '../config/apiConfig';

const OFFLINE_LOCATIONS_KEY = '@offline_locations';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;
const INITIAL_TIMEOUT = 15000; // Increased initial timeout
const MAX_TIMEOUT = 30000;    // Maximum timeout for retries
const BATCH_SIZE = 5; // Number of locations to sync in each batch
const SYNC_INTERVAL = 60000; // 1 minute between sync attempts
let lastSyncAttempt = 0;

// Utility function to delay execution with exponential backoff
const delay = (retryCount) => new Promise(resolve => 
  setTimeout(resolve, Math.min(RETRY_DELAY * Math.pow(2, retryCount), MAX_TIMEOUT))
);

// Function to check network connectivity using fetch
const checkNetworkConnectivity = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // Reduced to 3 seconds

    try {
      console.log('[MongoDB] Testing network connectivity to:', API_ENDPOINTS.auth.test);
      const response = await fetch(`${API_ENDPOINTS.auth.test}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      clearTimeout(timeoutId);
      
      if (response.ok) {
        console.log('[MongoDB] Network connectivity check successful');
        return true;
      } else {
        console.log('[MongoDB] Network check failed with status:', response.status);
        return false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.log('[MongoDB] Network check timed out after 3 seconds');
      } else {
        console.log('[MongoDB] Network check failed:', error.message);
      }
      return false;
    }
  } catch (error) {
    console.error('[MongoDB] Error in network check:', error);
    return false;
  }
};

// Add time formatting helper function
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
    console.error('[Mongo Service] Error formatting date to IST:', error);
    // Fallback to basic format if there's an error
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} IST`;
  }
};

// Function to save location data to MongoDB with improved error handling
export const saveLocationToMongo = async (locationData) => {
  try {
    // Ensure we have properly formatted timestamps
    if (!locationData.timestamp || !locationData.timestamp.includes('IST')) {
      locationData.timestamp = formatDateTime(new Date());
    }
    if (!locationData.formattedTime || !locationData.formattedTime.includes('IST')) {
      locationData.formattedTime = locationData.timestamp;
    }
    if (!locationData.isoTimestamp) {
      locationData.isoTimestamp = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000)).toISOString();
    }
    
    // Add timezone info if not present
    if (!locationData.timezone) {
      locationData.timezone = 'Asia/Kolkata';
    }

    // Check network connectivity first (but don't fail immediately)
    const isConnected = await checkNetworkConnectivity();
    if (!isConnected) {
      console.log('[Mongo Service] Network connectivity check failed, attempting direct save anyway');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Reduced to 10 seconds

    try {
      console.log('[Mongo Service] Attempting to save location to:', API_ENDPOINTS.location.saveWithEmail);
      const response = await fetch(`${API_ENDPOINTS.location.saveWithEmail}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(locationData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log('[Mongo Service] Location saved successfully with time:', locationData.timestamp);
      return true;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Try fallback URL if main URL fails
      if (fetchError.name === 'AbortError' || fetchError.message.includes('Network')) {
        console.log('[Mongo Service] Main URL failed, trying fallback...');
        try {
          const fallbackUrl = API_ENDPOINTS.location.saveWithEmail.replace('10.0.2.2:5000', 'localhost:5000');
          console.log('[Mongo Service] Trying fallback URL:', fallbackUrl);
          
          const fallbackResponse = await fetch(fallbackUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(locationData)
          });

          if (!fallbackResponse.ok) {
            throw new Error(`Fallback HTTP error! status: ${fallbackResponse.status}`);
          }

          console.log('[Mongo Service] Location saved successfully via fallback with time:', locationData.timestamp);
          return true;
        } catch (fallbackError) {
          console.log('[Mongo Service] Fallback URL also failed:', fallbackError.message);
          throw fetchError; // Throw original error
        }
      }
      
      throw fetchError;
    }
  } catch (error) {
    // Only log specific network errors, not all errors
    if (error.name === 'AbortError' || error.message.includes('Network') || error.message.includes('fetch')) {
      console.error('[Mongo Service] Network error saving location:', error.message);
    } else {
      console.error('[Mongo Service] Error saving location:', error);
    }
    throw error;
  }
};

// Function to save location data offline
export const saveLocationOffline = async (locationData) => {
  try {
    // Ensure we have a properly formatted timestamp for offline storage
    if (!locationData.timestamp) {
      locationData.timestamp = formatDateTime(new Date());
    }
    if (!locationData.formattedTime) {
      locationData.formattedTime = locationData.timestamp;
    }

    // Get existing offline locations
    const offlineLocations = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    let locations = offlineLocations ? JSON.parse(offlineLocations) : {};

    // Add new location
    locations[locationData.email] = locations[locationData.email] || [];
    locations[locationData.email].push({
      ...locationData,
      savedAt: formatDateTime(new Date()) // Add offline save timestamp
    });

    // Save back to storage
    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(locations));
    console.log('[Mongo Service] Location saved offline with time:', locationData.timestamp);
    return true;
  } catch (error) {
    console.error('[Mongo Service] Error saving location offline:', error);
    return false;
  }
};

// Function to sync offline locations
export const syncOfflineLocations = async () => {
  try {
    const offlineLocations = await AsyncStorage.getItem(OFFLINE_LOCATIONS_KEY);
    if (!offlineLocations) {
      return true;
    }

    const locations = JSON.parse(offlineLocations);
    if (!locations.length) {
      return true;
    }

    console.log(`[Mongo Service] Syncing ${locations.length} offline locations`);

    // Try to sync each location
    const syncResults = await Promise.all(
      locations.map(async (location) => {
        try {
          // Ensure timestamp is in correct format
          if (!location.timestamp.includes('-')) {
            location.timestamp = formatDateTime(new Date(location.timestamp));
          }
          if (!location.formattedTime) {
            location.formattedTime = location.timestamp;
          }

          await saveLocationToMongo(location);
          return true;
        } catch (error) {
          console.error('[Mongo Service] Error syncing location:', error);
          return false;
        }
      })
    );

    // Remove successfully synced locations
    const remainingLocations = locations.filter((_, index) => !syncResults[index]);
    await AsyncStorage.setItem(OFFLINE_LOCATIONS_KEY, JSON.stringify(remainingLocations));

    const successCount = syncResults.filter(Boolean).length;
    console.log(`[Mongo Service] Successfully synced ${successCount} of ${locations.length} locations`);

    return remainingLocations.length === 0;
  } catch (error) {
    console.error('[Mongo Service] Error in sync process:', error);
    return false;
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

// Function to periodically sync offline locations
export const startOfflineSync = () => {
  // Sync offline locations every 5 minutes
  setInterval(async () => {
    try {
      const isConnected = await checkNetworkConnectivity();
      if (isConnected) {
        await syncOfflineLocations();
      }
    } catch (error) {
      console.log('[Mongo Service] Offline sync check failed:', error.message);
    }
  }, 300000); // 5 minutes
};

export const getLastLocation = async (email) => {
  try {
    const response = await axios.get(API_ENDPOINTS.location.getByEmail(email));
    return response.data.data;
  } catch (error) {
    console.error('[MongoDB] Error getting last location:', error);
    return null;
  }
}; 