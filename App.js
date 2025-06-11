import React, { useEffect, useState, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, LogBox, Platform, ActivityIndicator, StatusBar } from 'react-native';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import { firebase } from './services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState } from './services/Firebase/authUtils';
import { fetchUser } from './services/Firebase/firestoreService';
import { initializeLocationTracking, startLocationTracking, stopLocationTracking } from './services/LocationService';
import { UserProvider, useUser } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { enableScreens } from 'react-native-screens';

// Enable native screens
enableScreens(true);

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

// Add debounce constant at the top
const LOCATION_CHECK_DEBOUNCE = 5000; // 5 seconds

function AppContent() {
  const { user, setUser } = useUser();
  const [isReady, setIsReady] = useState(false);
  const [isLocationInitialized, setIsLocationInitialized] = useState(false);
  const [lastLocationCheck, setLastLocationCheck] = useState(0);

  // Initialize location tracking
  useEffect(() => {
    const setupLocationTracking = async () => {
      try {
        // Debounce location checks
        const now = Date.now();
        if (now - lastLocationCheck < LOCATION_CHECK_DEBOUNCE) {
          return;
        }
        setLastLocationCheck(now);

        // Only initialize if not already initialized and user is logged in
        if (!isLocationInitialized && user && user.email) {
          await initializeLocationTracking();
          
          // Normalize role for comparison
          const normalizedRole = user.role?.toLowerCase()?.trim();
          
          // Only start tracking for staff, faculty, and admin users
          if (['staff', 'faculty', 'admin'].includes(normalizedRole)) {
            await startLocationTracking(true); // Force start tracking
            console.log('✅ Location tracking initialized for authorized role:', {
              email: user.email,
              role: normalizedRole
            });
          } else if (normalizedRole) { // Only log if role exists
            console.log('ℹ️ Location tracking not needed for role:', normalizedRole);
            // Ensure tracking is stopped for unauthorized roles
            await stopLocationTracking();
          }
          setIsLocationInitialized(true);
        }
      } catch (error) {
        console.error('Location tracking setup error:', error);
        setIsLocationInitialized(false);
      }
    };

    setupLocationTracking();

    // Cleanup when user logs out or role changes
    return () => {
      const cleanup = async () => {
        const normalizedRole = user?.role?.toLowerCase()?.trim();
        if (!user || !['staff', 'faculty', 'admin'].includes(normalizedRole)) {
          await stopLocationTracking();
          setIsLocationInitialized(false);
        }
      };
      cleanup();
    };
  }, [user, user?.role, isLocationInitialized]);

  // Handle auth state changes
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = firebase.auth().onAuthStateChanged(async (firebaseUser) => {
      if (!isMounted) return;

      if (firebaseUser) {
        try {
          const userData = await fetchUser(firebaseUser.email);
          if (userData && isMounted) {
            const completeUser = {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              emailVerified: firebaseUser.emailVerified,
              ...userData,
              role: userData.role?.toLowerCase()
            };
            // Only update if user data has changed
            if (JSON.stringify(completeUser) !== JSON.stringify(user)) {
              setUser(completeUser);
            }
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          if (isMounted) {
            setUser(null);
          }
        }
      } else {
        if (isMounted) {
          setUser(null);
        }
      }
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Compute navigation state only when user changes
  const navigationState = useMemo(() => ({
    isLoggedIn: !!user?.email,
    isReady: true,
    userRole: user?.role?.toLowerCase()
  }), [user?.email, user?.role]);

  if (!isReady) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <AppNavigator {...navigationState} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1D3557" />
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <ErrorBoundary>
            <UserProvider>
              <AppContent />
            </UserProvider>
          </ErrorBoundary>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}