import AsyncStorage from '@react-native-async-storage/async-storage';

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

export const setAuthState = async (user) => {
  try {
    const userData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      // Add other user properties you need to persist
      ...(user.token && { token: user.token }),
      ...(user.name && { name: user.name }),
      ...(user.role && { role: user.role }),
      lastLoginTime: new Date().toISOString()
    };
    
    // Store auth state
    await AsyncStorage.setItem('@auth_user', JSON.stringify(userData));
    // Set a flag indicating user is logged in
    await AsyncStorage.setItem('@is_logged_in', 'true');
    
  } catch (e) {
    console.error('Error saving auth state', e);
    throw e;
  }
};

export const getAuthState = async () => {
  try {
    const [userString, isLoggedIn] = await Promise.all([
      AsyncStorage.getItem('@auth_user'),
      AsyncStorage.getItem('@is_logged_in')
    ]);

    if (!isLoggedIn || !userString) {
      return null;
    }

    const userData = JSON.parse(userString);
    
    // Validate stored data
    if (!userData.uid || !userData.email) {
      await clearAuthState();
      return null;
    }

    return userData;
  } catch (e) {
    console.error('Error getting auth state', e);
    return null;
  }
};

export const clearAuthState = async () => {
  try {
    await Promise.all([
      AsyncStorage.removeItem('@auth_user'),
      AsyncStorage.removeItem('@is_logged_in')
    ]);
  } catch (e) {
    console.error('Error clearing auth state', e);
    throw e;
  }
};

export const isLoggedIn = async () => {
  try {
    const isLoggedIn = await AsyncStorage.getItem('@is_logged_in');
    return isLoggedIn === 'true';
  } catch (e) {
    console.error('Error checking login state', e);
    return false;
  }
};