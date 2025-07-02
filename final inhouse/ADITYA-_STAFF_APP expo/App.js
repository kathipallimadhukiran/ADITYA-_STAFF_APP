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
import { startLocationTracking, startPostLoginTracking, setNavigationReady, setupTerminationListener } from './services/LocationService';
import * as TaskManager from 'expo-task-manager';
import { RealmProvider } from '@realm/react';
import { getRealmConfig, closeRealm } from './config/realmConfig';
import TestCamera from './test-camera';

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
  'No attendance marked for today',
  'Realm is not defined',
  'Task already defined'
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
  if (user?.email && ['staff', 'admin', 'faculty'].includes(user?.role?.toLowerCase())) {
    return (
      <LocationPermissionWrapper>
        <AppNavigator {...navigationState} />
      </LocationPermissionWrapper>
    );
  }

  return <AppNavigator {...navigationState} />;
}

// Define task names
const LOCATION_TASK_NAME = 'background-location-task';
const RECOVERY_TASK_NAME = 'location-recovery-task';
const BACKGROUND_TASK_NAME = 'background-location-update';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [realmConfig, setRealmConfig] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[App] Starting app initialization');
        
        // Clear any old cache that might cause initialization issues
        await AsyncStorage.multiRemove([
          '@location_tracking_state',
          '@location_permission_status',
          'lastLocationError'
        ]).catch(error => {
          console.log('[App] Error clearing cache:', error);
        });

        // Get Realm configuration
        const config = await getRealmConfig();
        setRealmConfig(config);

        // Add a small delay to ensure cleanup is complete
        await new Promise(resolve => setTimeout(resolve, 100));
        
        setIsInitialized(true);
        console.log('[App] App initialized successfully');
      } catch (error) {
        console.error('[App] Error in app initialization:', error);
        // Even if there's an error, we should still show the app
        setIsInitialized(true);
      }
    };

    initializeApp();

    // Cleanup function
    return () => {
      closeRealm();
    };
  }, []);

  useEffect(() => {
    // Setup termination listener
    setupTerminationListener();

    // Ensure background tasks are defined
    const defineTasks = async () => {
      try {
        // Define tasks if not already defined
        if (!TaskManager.isTaskDefined(LOCATION_TASK_NAME)) {
          console.log('[DEBUG] Defining location task');
          TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data: { locations }, error }) => {
            if (error) {
              console.error('[Location Service] Background location task error:', error);
              return;
            }
            // Task implementation will be handled by LocationService
            return null;
          });
        }

        if (!TaskManager.isTaskDefined(RECOVERY_TASK_NAME)) {
          console.log('[DEBUG] Defining recovery task');
          TaskManager.defineTask(RECOVERY_TASK_NAME, async () => {
            // Task implementation will be handled by LocationService
            return null;
          });
        }

        if (!TaskManager.isTaskDefined(BACKGROUND_TASK_NAME)) {
          console.log('[DEBUG] Defining background task');
          TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
            // Task implementation will be handled by LocationService
            return null;
          });
        }
      } catch (error) {
        console.error('[App] Error defining background tasks:', error);
      }
    };

    defineTasks();
  }, []);

  if (!isInitialized || !realmConfig) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <PaperProvider theme={theme}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <RealmProvider {...realmConfig}>
              <AuthProvider>
                <UserProvider>
                  <NavigationContainer
                    ref={global.navigationRef}
                    linking={linking}
                    onReady={() => {
                      setNavigationReady(true);
                    }}
                  >
                    <StatusBar
                      barStyle="dark-content"
                      backgroundColor={theme.colors.background}
                    />
                    <AppContent />
                  </NavigationContainer>
                </UserProvider>
              </AuthProvider>
            </RealmProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PaperProvider>
    </ErrorBoundary>
  );
}