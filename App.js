import React, { useEffect, useState, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppNavigator from './navigation/AppNavigator';
import { firebase, getAuth } from './services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState } from './services/Firebase/authUtils';
import { UserProvider, useUser } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { initializeLocationTracking, startLocationTracking } from './services/LocationService';

// Define custom theme
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1D3557',
    accent: '#457B9D',
    background: '#f8f9fa',
    surface: '#ffffff',
    text: '#1D3557',
    error: '#FF5722',
    disabled: '#C5CAE9',
    placeholder: '#6c757d',
    backdrop: 'rgba(0, 0, 0, 0.5)',
    notification: '#F94144',
  },
  roundness: 8,
};

// Debug logs for initialization
console.log('[DEBUG] App.js initializing');

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Sending...',
  'Failed to get FCM token',
  'No attendance marked for today'
]);

// Basic fallback to detect physical device (not 100% accurate but works)
const isPhysicalDevice = Platform.OS !== 'web' && !__DEV__;

function AppContent() {
  const { user, setUser } = useUser();
  const [isReady, setIsReady] = useState(false);
  const [isLocationInitialized, setIsLocationInitialized] = useState(false);

  // Initialize location tracking
  useEffect(() => {
    const setupLocationTracking = async () => {
      try {
        // Only initialize if not already initialized and user is logged in
        if (!isLocationInitialized && user && user.email) {
          await initializeLocationTracking();
          // Only start tracking for staff users
          if (user.role === 'staff') {
            await startLocationTracking(true); // Force start tracking
            console.log('✅ Location tracking initialized for staff:', user.email);
          } else {
            console.log('ℹ️ Location tracking not needed for role:', user.role);
          }
          setIsLocationInitialized(true);
        }
      } catch (error) {
        console.error('Location tracking setup error:', error);
        setIsLocationInitialized(false);
      }
    };

    setupLocationTracking();

    // Cleanup when user logs out
    return () => {
      if (!user) {
        setIsLocationInitialized(false);
      }
    };
  }, [user, user?.role, isLocationInitialized]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const persistedUser = await getAuthState();
        setIsReady(true);
      } catch (error) {
        console.error('Auth check error:', error);
        setIsReady(true);
      }
    };

    // Set up Firebase auth listener
    const unsubscribe = firebase.auth().onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        // User is signed out
        await clearAuthState();
        setUser(null);
      } else {
        setUser(firebaseUser);
      }
      setIsReady(true);
    });

    checkAuth();

    // Cleanup subscription
    return () => unsubscribe();
  }, [setUser]);

  const navigationState = useMemo(() => ({
    isLoggedIn: !!user,
    userRole: user?.role,
    isReady: isReady
  }), [user, isReady]);

  if (!isReady) {
    return null;
  }

  return (
    <NavigationContainer>
      <AppNavigator {...navigationState} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PaperProvider theme={theme}>
        <View style={{ flex: 1, backgroundColor: '#fff' }}>
          <UserProvider>
            <AppContent />
          </UserProvider>
        </View>
      </PaperProvider>
    </ErrorBoundary>
  );
}