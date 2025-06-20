import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, Platform, Image, Animated, Easing } from 'react-native';
import { firebase } from '../services/Firebase/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState, isFirstInstall } from '../services/Firebase/authUtils';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';

// 1. Create the context
export const AuthContext = createContext(null);

// Basic fallback to detect physical device
const isPhysicalDevice = Platform.OS !== 'web' && !__DEV__;

// Valid roles configuration
const VALID_ROLES = ['student', 'staff', 'admin', 'faculty'];
const DEFAULT_ROLE = 'student';

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

    // Save token to Firestore with lowercase email
    const lowerEmail = user.email.toLowerCase().trim();
    await firebase.firestore().collection('users').doc(lowerEmail).set(
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
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

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

  const validateRole = (role) => {
    if (!role || typeof role !== 'string') return DEFAULT_ROLE;
    const normalizedRole = role.toLowerCase();
    return VALID_ROLES.includes(normalizedRole) ? normalizedRole : DEFAULT_ROLE;
  };

  const login = async (userData) => {
    try {
      // Ensure role is valid
      const validatedRole = validateRole(userData.role);
      const normalizedUser = {
        ...userData,
        role: validatedRole,
        email: userData.email.toLowerCase().trim()
      };

      setUser(normalizedUser);
      setIsLoggedIn(true);
      await setAuthState(normalizedUser);

      // Debug log
      console.log('[DEBUG] Login successful:', {
        email: normalizedUser.email,
        role: normalizedUser.role,
        isLoggedIn: true
      });
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async (navigation) => {
    try {
      // Sign out from Firebase
      await firebase.auth().signOut();
      
      // Clear all stored data
      const keysToRemove = [
        '@user_data',
        '@is_logged_in',
        '@user_email',
        '@user_password',
        '@auth_user',
        '@auth_password',
        '@navigation_state',
        'userEmail',
        'locationData',
        'lastLocationUpdate',
        'attendanceData',
        'lastAttendanceUpdate'
      ];

      // Clear all AsyncStorage data
      await AsyncStorage.multiRemove(keysToRemove);
      await clearAuthState();

      // Reset state
      setUser(null);
      setIsLoggedIn(false);
      setAuthError(null);

      // Reset navigation state to initial route
      if (navigation) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Login' }],
        });
      }

      console.log('[DEBUG] User signed out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

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
              const lowerEmail = firebaseUser.email.toLowerCase().trim();
              const userDoc = await firebase.firestore().collection('users').doc(lowerEmail).get();
              
              if (userDoc.exists) {
                const userData = userDoc.data();
                const validatedRole = validateRole(userData.role);
                
                // Register push token
                await registerAndSavePushToken(firebaseUser);
                
                // Update user state
                const normalizedUser = {
                  ...userData,
                  email: lowerEmail,
                  role: validatedRole,
                  uid: firebaseUser.uid
                };
                
                // Set user state and persist it
                setUser(normalizedUser);
                setIsLoggedIn(true);
                await setAuthState(normalizedUser);

                // Prepare navigation - map faculty to staff dashboard
                const effectiveRole = validatedRole === 'faculty' ? 'staff' : validatedRole;
                const dashboardRoute = `${effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1)}Dashboard`;
                
                // Debug navigation state
                console.log('[DEBUG] Auto-login navigation:', {
                  originalRole: validatedRole,
                  effectiveRole,
                  targetRoute: dashboardRoute,
                  hasNavigationRef: !!global.navigationRef?.current,
                  isNavigationReady: global.navigationRef?.current?.isReady?.()
                });

                // Wait a bit to ensure navigation is ready
                setTimeout(() => {
                  if (global.navigationRef?.current?.isReady?.()) {
                    console.log('[DEBUG] Executing navigation to:', dashboardRoute);
                    global.navigationRef.current.dispatch(
                      CommonActions.reset({
                        index: 0,
                        routes: [{ name: dashboardRoute }],
                      })
                    );
                  } else {
                    console.log('[DEBUG] Navigation not ready, storing pending navigation');
                    global.pendingNavigation = {
                      route: dashboardRoute,
                      action: 'reset'
                    };
                  }
                }, 100);
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
        console.error('Error checking auth state:', error);
        setInitializing(false);
      }
    };

    checkAuthState();

    return () => {
      if (unsubscribeFromAuth) {
        unsubscribeFromAuth();
      }
    };
  }, []);

  useEffect(() => {
    if (initializing) {
      // Reset animations
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.95);

      // Start parallel animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // After initial animation, start subtle floating effect
        Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.05,
              duration: 1500,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 1500,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    }
  }, [initializing, fadeAnim, scaleAnim]);

  if (initializing) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#fff7ed' 
      }}>
        <Animated.View style={{ 
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: 'center'
        }}>
          <Image
            source={require('../assets/college-logo.png')}
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

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        isLoggedIn,
        setIsLoggedIn,
        login,
        logout,
        authError,
        initializing,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// 3. Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
