import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, Text, LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppNavigator from './navigation/AppNavigator';
import { firebase } from './services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState, isFirstInstall } from './services/Firebase/authUtils';
import { UserProvider } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';

// Debug logs for initialization
console.log('[DEBUG] App.js - Starting app initialization');

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
]);

// Basic fallback to detect physical device (not 100% accurate but works)
const isPhysicalDevice = Platform.OS !== 'web' && !__DEV__;

// Register and save Expo push token to Firestore
const registerAndSavePushToken = async (user) => {
  try {
    if (!isPhysicalDevice) {
      console.log('[DEBUG] Push notifications skipped - not a physical device');
      return;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[DEBUG] Notification permissions not granted');
      return;
    }

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync();

    if (!expoPushToken) {
      console.log('[DEBUG] Failed to get Expo push token');
      return;
    }

    // Save token to Firestore
    await firebase.firestore().collection('users').doc(user.email).set(
      {
        expoPushToken,
      },
      { merge: true }
    );

    console.log('[DEBUG] Push token saved successfully');
  } catch (error) {
    console.error('[DEBUG] Error in registerAndSavePushToken:', error);
  }
};

export default function App() {
  console.log('[DEBUG] App component rendering');
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [showLogin, setShowLogin] = useState(false);

  // Set up notifications
  useEffect(() => {
    console.log('[DEBUG] Notifications useEffect starting');
    const setupNotifications = async () => {
      try {
        await Notifications.setNotificationHandler({
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
        console.log('[DEBUG] Notifications setup completed');
      } catch (error) {
        console.error('[DEBUG] Error setting up notifications:', error);
      }
    };

    setupNotifications();

    const notificationSubscription = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('[DEBUG] Notification tapped:', response);
    });

    return () => {
      notificationSubscription.remove();
    };
  }, []);

  // Set up authentication
  useEffect(() => {
    console.log('[DEBUG] Auth useEffect starting');
    let unsubscribeFromAuth = null;

    const checkAuthState = async () => {
      try {
        console.log('[DEBUG] Checking first install and auth state');
        const firstInstall = await isFirstInstall();
        const persistedUser = await getAuthState();
        console.log('[DEBUG] First install:', firstInstall);
        console.log('[DEBUG] Persisted user:', persistedUser ? 'exists' : 'none');

        if (firstInstall) {
          console.log('[DEBUG] First install - showing login');
          setShowLogin(true);
          setInitializing(false);
          return;
        }

        unsubscribeFromAuth = firebase.auth().onAuthStateChanged(async (user) => {
          console.log('[DEBUG] Auth state changed:', user ? 'user exists' : 'no user');
          if (user && user.emailVerified) {
            try {
              console.log('[DEBUG] Getting user token and data');
              const idToken = await user.getIdToken();
              const userDoc = await firebase.firestore().collection('users').doc(user.email).get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                console.log('[DEBUG] User data retrieved:', userData.role);
                const userWithToken = { 
                  ...user, 
                  token: idToken,
                  role: userData.role 
                };
                await setAuthState(userWithToken);
                setUser(userWithToken);
                setUserRole(userData.role);
                setShowLogin(false);
                console.log('[DEBUG] User state set successfully');

                // Register and save push token
                await registerAndSavePushToken(user);
              } else {
                console.log('[DEBUG] User document not found');
                throw new Error('User document not found');
              }
            } catch (tokenError) {
              console.error('[DEBUG] Error fetching token:', tokenError);
              setAuthError('Failed to get user data.');
            }
          } else {
            console.log('[DEBUG] No authenticated user - clearing state');
            await clearAuthState();
            setUser(null);
            setUserRole(null);
            setShowLogin(true);
          }
          setInitializing(false);
        });
      } catch (error) {
        console.error('[DEBUG] Auth initialization error:', error);
        setAuthError('Failed to initialize authentication');
        setInitializing(false);
        setShowLogin(true);
      }
    };

    checkAuthState();

    return () => {
      if (typeof unsubscribeFromAuth === 'function') {
        unsubscribeFromAuth();
      }
    };
  }, []);

  console.log('[DEBUG] App render state:', { 
    initializing, 
    hasUser: !!user, 
    userRole, 
    showLogin, 
    hasError: !!authError 
  });

  const renderContent = () => {
    if (initializing) {
      console.log('[DEBUG] Showing loading screen');
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={{ marginTop: 10, color: '#1D3557' }}>Loading authentication...</Text>
        </View>
      );
    }

    if (authError) {
      console.log('[DEBUG] Showing error screen');
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#fff' }}>
          <Text style={{ color: 'red', fontSize: 18 }}>{authError}</Text>
          <Text style={{ marginTop: 10, color: '#1D3557' }}>Please restart the app</Text>
        </View>
      );
    }

    console.log('[DEBUG] Rendering main app content');
    return (
      <ErrorBoundary>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <UserProvider>
            <NavigationContainer>
              <AppNavigator 
                isLoggedIn={!showLogin && !!user} 
                userRole={userRole}
              />
            </NavigationContainer>
          </UserProvider>
        </View>
      </ErrorBoundary>
    );
  };

  return (
    <ErrorBoundary>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {renderContent()}
      </View>
    </ErrorBoundary>
  );
}
