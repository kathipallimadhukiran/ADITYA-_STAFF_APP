import React, { useEffect, useState, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, LogBox, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AppNavigator from './navigation/AppNavigator';
import { firebase } from './services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState } from './services/Firebase/authUtils';
import { fetchUser } from './services/Firebase/firestoreService';
import { initializeLocationTracking, startLocationTracking } from './services/LocationService';
import { UserProvider, useUser } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';

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