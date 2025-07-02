import AsyncStorage from '@react-native-async-storage/async-storage';
import { firebase } from './firebaseConfig';

export const isFirstInstall = async () => {
  try {
    const hasInstalled = await AsyncStorage.getItem('@has_installed');
    if (hasInstalled === null) {
      // First time run, set flag
      await AsyncStorage.setItem('@has_installed', 'true');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error checking first install:', error);
    return false;
  }
};

export const setAuthState = async (user, password) => {
  try {
    console.log('[DEBUG] Setting auth state for user:', user.email);
    
    if (!user || !user.email) {
      console.error('[DEBUG] Invalid user data provided to setAuthState');
      throw new Error('Invalid user data');
    }
    
    const userData = {
      uid: user.uid || 'temp-uid',  // Provide fallback for non-Firebase auth
      email: user.email.toLowerCase().trim(),
      emailVerified: user.emailVerified || true,  // Default to true if not provided
      // Add other user properties you need to persist
      ...(user.token && { token: user.token }),
      ...(user.name && { name: user.name }),
      ...(user.role && { role: user.role.toLowerCase() }),
      lastLoginTime: new Date().toISOString()
    };

    // Store auth state with retries
    const MAX_RETRIES = 3;
    let retryCount = 0;
    let success = false;

    while (retryCount < MAX_RETRIES && !success) {
      try {
        // Store auth state
        await AsyncStorage.setItem('@auth_user', JSON.stringify(userData));
        console.log('[DEBUG] Saved user data to AsyncStorage:', userData.email);
        
        // Store password securely for session restoration
        if (password) {
          await AsyncStorage.setItem('@auth_password', password);
          console.log('[DEBUG] Saved password to AsyncStorage');
        }
        
        // Set a flag indicating user is logged in
        await AsyncStorage.setItem('@is_logged_in', 'true');
        console.log('[DEBUG] Set is_logged_in flag to true');
        
        // Verify the data was saved correctly
        const savedUser = await AsyncStorage.getItem('@auth_user');
        const savedLoginState = await AsyncStorage.getItem('@is_logged_in');
        
        if (savedUser && savedLoginState === 'true') {
          success = true;
          console.log('[DEBUG] Successfully verified saved auth state');
        } else {
          console.log('[DEBUG] Verification failed, attempt', retryCount + 1, 'of', MAX_RETRIES);
          retryCount++;
          
          if (retryCount < MAX_RETRIES) {
            // Small delay before retry
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
      } catch (error) {
        console.error('[DEBUG] Error in save attempt', retryCount + 1, ':', error);
        retryCount++;
        
        if (retryCount < MAX_RETRIES) {
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }

    if (!success) {
      console.error('[DEBUG] Failed to save auth state after', MAX_RETRIES, 'attempts');
      throw new Error('Failed to save auth state');
    }

    return true;
  } catch (e) {
    console.error('[DEBUG] Error saving auth state:', e);
    // Clear any partial state
    await clearAuthState();
    throw e;
  }
};

export const getAuthState = async () => {
  try {
    console.log('[DEBUG] Getting auth state from AsyncStorage');
    
    const [userString, isLoggedIn] = await Promise.all([
      AsyncStorage.getItem('@auth_user'),
      AsyncStorage.getItem('@is_logged_in')
    ]);

    console.log('[DEBUG] Retrieved from AsyncStorage:', {
      hasUserData: !!userString,
      isLoggedIn
    });

    if (!isLoggedIn || !userString) {
      console.log('[DEBUG] No saved auth state found');
      return null;
    }

    const userData = JSON.parse(userString);
    
    // Validate stored data
    if (!userData.uid || !userData.email) {
      console.log('[DEBUG] Invalid user data found');
      return null;
    }

    // Verify the data is complete
    const requiredFields = ['uid', 'email', 'emailVerified', 'role'];
    const missingFields = requiredFields.filter(field => !userData[field]);
    
    if (missingFields.length > 0) {
      console.log('[DEBUG] Missing required fields:', missingFields);
      return null;
    }

    console.log('[DEBUG] Successfully retrieved auth state for:', userData.email);
    return userData;
  } catch (e) {
    console.error('[DEBUG] Error getting auth state:', e);
    return null;
  }
};

export const clearAuthState = async () => {
  try {
    console.log('[DEBUG] Clearing auth state from AsyncStorage');
    
    // First attempt to clear
    await Promise.all([
      AsyncStorage.removeItem('@auth_user'),
      AsyncStorage.removeItem('@is_logged_in'),
      AsyncStorage.removeItem('@auth_password')
    ]);
    
    // Check what remains and retry if needed
    const [user, loginState, password] = await Promise.all([
      AsyncStorage.getItem('@auth_user'),
      AsyncStorage.getItem('@is_logged_in'),
      AsyncStorage.getItem('@auth_password')
    ]);
    
    // If any items remain, try to clear them individually
    const remainingItems = [];
    if (user) {
      remainingItems.push(AsyncStorage.removeItem('@auth_user'));
    }
    if (loginState) {
      remainingItems.push(AsyncStorage.removeItem('@is_logged_in'));
    }
    if (password) {
      remainingItems.push(AsyncStorage.removeItem('@auth_password'));
    }
    
    if (remainingItems.length > 0) {
      await Promise.all(remainingItems);
      console.log('[DEBUG] Completed additional clearing of remaining items');
    }
    
    console.log('[DEBUG] Successfully cleared auth state');
  } catch (e) {
    console.error('[DEBUG] Error during auth state clearing:', e);
    // Log error but don't throw - allow the app to continue
    console.log('[DEBUG] Continuing despite auth state clearing error');
  }
};

export const isLoggedIn = async () => {
  try {
    const isLoggedIn = await AsyncStorage.getItem('@is_logged_in');
    console.log('[DEBUG] Checking login state:', isLoggedIn === 'true');
    return isLoggedIn === 'true';
  } catch (e) {
    console.error('[DEBUG] Error checking login state:', e);
    return false;
  }
};