import React, { createContext, useState, useContext, useEffect } from 'react';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { firebase } from '../services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState, isFirstInstall } from '../services/Firebase/authUtils';
import * as Notifications from 'expo-notifications';

// 1. Create the context
export const AuthContext = createContext(null);

// Basic fallback to detect physical device
const isPhysicalDevice = Platform.OS !== 'web' && !__DEV__;

// Register and save Expo push token to Firestore
const registerAndSavePushToken = async (user) => {
  try {
    if (!isPhysicalDevice) {
      console.warn('Push notifications only work on physical devices');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted!');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();

    if (!expoPushToken) {
      console.warn('Failed to get Expo push token');
      return;
    }

    // Save token to Firestore
    await firebase.firestore().collection('users').doc(user.email).set(
      {
        expoPushToken,
      },
      { merge: true }
    );

    console.log('Push token saved:', expoPushToken);
  } catch (error) {
    console.error('Error registering push token:', error);
  }
};

// 2. Create a provider component
export const AuthProvider = ({ children }) => {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Set up notifications
  useEffect(() => {
    const setupNotifications = async () => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    };

    setupNotifications();

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
    });

    return () => {
      notificationSubscription.remove();
    };
  }, []);

  // Set up authentication
  useEffect(() => {
    let unsubscribeFromAuth = null;

    const checkAuthState = async () => {
      try {
        const firstInstall = await isFirstInstall();
        const persistedUser = await getAuthState();

        if (firstInstall) {
          setInitializing(false);
          return;
        }

        unsubscribeFromAuth = firebase.auth().onAuthStateChanged(async (firebaseUser) => {
          if (firebaseUser && firebaseUser.emailVerified) {
            try {
              const idToken = await firebaseUser.getIdToken();
              const userDoc = await firebase.firestore().collection('users').doc(firebaseUser.email).get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                const completeUser = {
                  uid: firebaseUser.uid,
                  email: firebaseUser.email,
                  emailVerified: firebaseUser.emailVerified,
                  token: idToken,
                  ...userData
                };
                await setAuthState(completeUser);
                setUser(completeUser);
                setIsLoggedIn(true);

                // Register and save push token
                await registerAndSavePushToken(completeUser);
              } else {
                throw new Error('User document not found');
              }
            } catch (error) {
              console.error('Error fetching user data:', error);
              setAuthError('Failed to get user data.');
              setIsLoggedIn(false);
            }
          } else {
            await clearAuthState();
            setUser(null);
            setIsLoggedIn(false);
          }
          setInitializing(false);
        });
      } catch (error) {
        console.error('Auth initialization error:', error);
        setAuthError('Failed to initialize authentication');
        setInitializing(false);
      }
    };

    checkAuthState();

    return () => {
      if (typeof unsubscribeFromAuth === 'function') {
        unsubscribeFromAuth();
      }
    };
  }, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ea580c" />
        <Text style={{ marginTop: 10 }}>Loading authentication...</Text>
      </View>
    );
  }

  if (authError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', fontSize: 18 }}>{authError}</Text>
        <Text style={{ marginTop: 10 }}>Please restart the app</Text>
      </View>
    );
  }

  const value = {
    user,
    setUser,
    isLoggedIn,
    setIsLoggedIn,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// 3. Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
