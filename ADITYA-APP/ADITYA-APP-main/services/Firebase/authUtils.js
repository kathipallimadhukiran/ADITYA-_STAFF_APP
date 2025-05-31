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
      ...(user.role && { role: user.role })
    };
    await AsyncStorage.setItem('@auth_user', JSON.stringify(userData));

    
  } catch (e) {
    console.error('Error saving auth state', e);
  }
};

export const getAuthState = async () => {
  try {
    const userString = await AsyncStorage.getItem('@auth_user');
    return userString ? JSON.parse(userString) : null;
  } catch (e) {
    console.error('Error getting auth state', e);
    return null;
  }
};

export const clearAuthState = async () => {
  try {
    await AsyncStorage.removeItem('@auth_user');
  } catch (e) {
    console.error('Error clearing auth state', e);
  }
};