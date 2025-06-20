import React, { useEffect, useState, useMemo, useRef } from 'react';
import { NavigationContainer, CommonActions } from '@react-navigation/native';
import { View, LogBox, Platform, ActivityIndicator, StatusBar, Text, Image, Animated, Easing } from 'react-native';
import * as Location from 'expo-location';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProvider, useUser } from './context/UserContext';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { enableScreens } from 'react-native-screens';
import { firebase } from './services/Firebase/firebaseConfig';
import LocationPermissionScreen from './components/LocationPermissionScreen';
import LocationPermissionWrapper from './components/LocationPermissionWrapper';
import { startLocationTracking, startPostLoginTracking, setNavigationReady } from './services/LocationService';

// Enable native screens
enableScreens();

// Add global navigation reference
global.navigationRef = React.createRef();

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

// Define linking configuration
const linking = {
  prefixes: ['aditya-app://'],
  config: {
    screens: {
      FacultyDashboard: 'faculty-dashboard',
      StudentDashboard: 'student-dashboard',
      StaffDashboard: 'staff-dashboard',
      AdminDashboard: 'admin-dashboard',
      Login: 'login',
      // Add other screens as needed
    },
  },
};

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Sending...',
  'Failed to get FCM token',
  'No attendance marked for today'
]);

function AppContent() {
  const { user, isLoading } = useUser();
  const blinkAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (user?.email && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
      startPostLoginTracking();
    }
  }, [user?.email, user?.role]);

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [blinkAnim]);

  const navigationState = useMemo(() => {
    const isLoggedIn = !!user?.email;
    const userRole = (user?.role || 'student').toLowerCase();
    const shouldNavigateToLogin = !user?.email;
    
    let initialRoute;
    if (isLoggedIn) {
      if (userRole === 'faculty') {
        initialRoute = 'StaffDashboard';
      } else {
        initialRoute = `${userRole.charAt(0).toUpperCase() + userRole.slice(1)}Dashboard`;
      }
    } else {
      initialRoute = 'Login';
    }

    return {
      isLoggedIn,
      userRole,
      shouldNavigateToLogin,
      initialRoute
    };
  }, [user?.email, user?.role]);

  if (isLoading) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: theme.colors.background 
      }}>
        <Animated.View style={{ 
          opacity: blinkAnim,
          alignItems: 'center'
        }}>
          <Image
            source={require('./assets/college-logo.png')}
            style={{
              width: 150,
              height: 150,
              resizeMode: 'contain'
            }}
          />
        </Animated.View>
      </View>
    );
  }

  // For staff and admin users, wrap with LocationPermissionWrapper
  if (user?.email && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
    return (
      <LocationPermissionWrapper>
        <AppNavigator {...navigationState} />
      </LocationPermissionWrapper>
    );
  }

  return <AppNavigator {...navigationState} />;
}

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const routeNameRef = useRef(null);

  useEffect(() => {
    const loadInitialState = async () => {
      try {
        const user = await AsyncStorage.getItem('@user_data');
        if (user) {
          const userData = JSON.parse(user);
          console.log('[DEBUG] Auto-login data loaded:', userData);
        }
      } catch (error) {
        console.error('[NAVIGATION] Auto-login error:', error);
      } finally {
        setIsReady(true);
      }
    };

    loadInitialState();
  }, []);

  const onStateChange = async () => {
    const currentRoute = global.navigationRef.current?.getCurrentRoute();
    const previousRouteName = routeNameRef.current;
    const currentRouteName = currentRoute?.name;

    if (previousRouteName !== currentRouteName) {
      routeNameRef.current = currentRouteName;
      console.log('[DEBUG] Navigation route changed:', {
        from: previousRouteName,
        to: currentRouteName,
        params: currentRoute?.params
      });
    }
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1D3557" />
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <ErrorBoundary>
            <AuthProvider>
              <UserProvider>
                <NavigationContainer
                  ref={global.navigationRef}
                  linking={linking}
                  onStateChange={onStateChange}
                  onReady={() => {
                    routeNameRef.current = global.navigationRef.current?.getCurrentRoute()?.name;
                    console.log('[DEBUG] Navigation container ready');
                    setNavigationReady(true);
                    setNavigationReady(true); // Set both local and LocationService state
                  }}
                  fallback={
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                      <ActivityIndicator size="large" color={theme.colors.primary} />
                      <Text style={{ marginTop: 10, color: theme.colors.primary }}>
                        Initializing navigation...
                      </Text>
                    </View>
                  }
                >
                  {isReady && navigationReady ? <AppContent /> : null}
                </NavigationContainer>
              </UserProvider>
            </AuthProvider>
          </ErrorBoundary>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}