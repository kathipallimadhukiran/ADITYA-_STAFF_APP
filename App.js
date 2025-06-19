import React, { useEffect, useState, useMemo, useRef } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { View, LogBox, Platform, ActivityIndicator, StatusBar, Text, AppState } from 'react-native';
import * as Location from 'expo-location';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProvider, useUser } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { enableScreens } from 'react-native-screens';
import { firebase } from './services/Firebase/firebaseConfig';
import LocationPermissionScreen from './components/LocationPermissionScreen';
import { startLocationTracking } from './services/LocationService';

// Enable native screens
enableScreens();

// Define custom theme
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1D3557',
    accent: '#457B9D',
    background: '#F1FAEE',
    surface: '#FFFFFF',
    text: '#1D3557',
    error: '#E63946',
    disabled: '#C5CAE9',
    placeholder: '#6c757d',
    backdrop: 'rgba(0, 0, 0, 0.5)',
    notification: '#A8DADC',
  },
  roundness: 8,
};

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Sending...',
  'Failed to get FCM token',
  'No attendance marked for today'
]);

function AppContent() {
  const { user, isLoading } = useUser();
  const [needsLocationPermission, setNeedsLocationPermission] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true);
  const permissionCheckInterval = useRef(null);
  const appStateSubscription = useRef(null);
  const lastPermissionCheck = useRef(Date.now());
  const previousScreenRef = useRef(null);
  const navigationRef = useRef(null);
  const PERMISSION_CHECK_DEBOUNCE = 1000; // 1 second debounce

  const checkLocationPermission = async (force = false) => {
    try {
      // Debounce check unless forced
      const now = Date.now();
      if (!force && now - lastPermissionCheck.current < PERMISSION_CHECK_DEBOUNCE) {
        return;
      }
      lastPermissionCheck.current = now;

      if (!user?.email || !['staff', 'admin'].includes(user?.role?.toLowerCase())) {
        setIsCheckingPermissions(false);
        setNeedsLocationPermission(false);
        return;
      }

      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();
      const services = await Location.hasServicesEnabledAsync();

      const needsPermission = !foreground.granted || !background.granted || !services;
      
      if (needsPermission && !needsLocationPermission) {
        const currentRoute = navigationRef.current?.getCurrentRoute();
        if (currentRoute) {
          previousScreenRef.current = {
            name: currentRoute.name,
            params: currentRoute.params
          };
        }
        setNeedsLocationPermission(true);
      } else if (!needsPermission) {
        setNeedsLocationPermission(false);
        await AsyncStorage.setItem('userEmail', user.email.toLowerCase());
        await startLocationTracking(true);
      }
    } catch (error) {
      setNeedsLocationPermission(true);
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  useEffect(() => {
    if (user?.email && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
      checkLocationPermission(true);

      permissionCheckInterval.current = setInterval(() => {
        checkLocationPermission();
      }, 1000);

      appStateSubscription.current = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          checkLocationPermission(true);
        }
      });
    }

    return () => {
      if (permissionCheckInterval.current) {
        clearInterval(permissionCheckInterval.current);
      }
      if (appStateSubscription.current?.remove) {
        appStateSubscription.current.remove();
      }
    };
  }, [user?.email, user?.role]);

  const handleLocationPermissionGranted = async () => {
    try {
      setNeedsLocationPermission(false);
      if (user?.email && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
        await AsyncStorage.setItem('userEmail', user.email.toLowerCase());
        await startLocationTracking(true);

        if (previousScreenRef.current && navigationRef.current) {
          const { name, params } = previousScreenRef.current;
          navigationRef.current.navigate(name, params);
          previousScreenRef.current = null;
        }
      }
    } catch (error) {
      // Handle error silently
    }
  };

  const navigationState = useMemo(() => ({
    isLoggedIn: !!user?.email,
    userRole: user?.role?.toLowerCase(),
    shouldNavigateToLogin: !user?.email
  }), [user?.email, user?.role]);

  if (isLoading || isCheckingPermissions) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.primary }}>
          {isLoading ? 'Loading user data...' : 'Preparing app...'}
        </Text>
      </View>
    );
  }

  if (needsLocationPermission && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
    return <LocationPermissionScreen onPermissionGranted={handleLocationPermissionGranted} />;
  }

  return <AppNavigator {...navigationState} />;
}

export default function App() {
  const navigationRef = useRef(null);
  const [navigationReady, setNavigationReady] = useState(false);

  const handleNavigationReady = () => {
    setNavigationReady(true);
  };

  const handleNavigationStateChange = () => {
    const appContent = navigationRef.current?.getCurrentRoute()?.params?.appContent;
    if (appContent?.checkLocationPermission) {
      appContent.checkLocationPermission(true);
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1D3557" />
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <ErrorBoundary>
            <UserProvider>
              <NavigationContainer 
                ref={navigationRef}
                onReady={handleNavigationReady}
                onStateChange={handleNavigationStateChange}
              >
                {navigationReady ? <AppContent /> : null}
              </NavigationContainer>
            </UserProvider>
          </ErrorBoundary>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}