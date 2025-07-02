import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { locationPermissionEmitter } from '../services/LocationService';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { isLocationPermissionRequired, monitorLocationServices, checkWorkingHours } from '../services/LocationService';
import { db } from '../services/Firebase/firebaseConfig';

const LocationPermissionWrapper = ({ children }) => {
  const navigation = useNavigation();
  const navigationState = useNavigationState(state => state);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    let monitoringCleanup = null;
    let permissionCheckInterval = null;
    let workingHoursInterval = null;
    let settingsUnsubscribe = null;

    const checkAndNavigateToPermissionScreen = async () => {
      try {
        // Skip permission check for LocationPermissionScreen itself
        const currentRoute = navigation.getCurrentRoute();
        if (currentRoute?.name === 'LocationPermissionScreen') {
          return;
        }

        // Get user role from AsyncStorage or context if available
        let userRole = null;
        try {
          const userDataStr = await AsyncStorage.getItem('@user_auth_data');
          if (userDataStr) {
            const userData = JSON.parse(userDataStr);
            userRole = userData?.role?.toLowerCase();
          }
        } catch (e) {}

        // Check if we're in working hours
        const workingHoursCheck = await checkWorkingHours(true); // Force fresh check
        
        // Only enforce location during working hours and for admin, staff, faculty
        if (
          workingHoursCheck.isWithinWorkingHours &&
          ['admin', 'staff', 'faculty'].includes(userRole)
        ) {
          const required = await isLocationPermissionRequired();
          if (required && mounted) {
            // Preserve current route params
            const params = {
              returnTo: currentRoute?.name,
              ...currentRoute?.params
            };

            navigation.reset({
              index: 0,
              routes: [
                { 
                  name: 'LocationPermissionScreen',
                  params
                }
              ],
            });
          }
        }
      } catch (error) {
        console.error('[Location Wrapper] Error checking requirements:', error);
      }
    };

    const initializeLocationMonitoring = async () => {
      if (!navigationState || !navigation) {
        return;
      }

      try {
        // Initial check
        await checkAndNavigateToPermissionScreen();

        // Start monitoring location services
        if (mounted) {
          monitoringCleanup = await monitorLocationServices(navigation);
        }

        // Set up real-time listener for settings changes
        settingsUnsubscribe = db.collection('settings').doc('attendance')
          .onSnapshot(async (doc) => {
            if (doc.exists && mounted) {
              await checkAndNavigateToPermissionScreen();
            }
          }, (error) => {
            console.error('[Location Wrapper] Settings listener error:', error);
          });

        // Set up periodic checks every 20 seconds for working hours
        if (mounted) {
          workingHoursInterval = setInterval(async () => {
            await checkAndNavigateToPermissionScreen();
          }, 20000); // 20 seconds
        }

        // Keep the 2-second permission check for quick response to permission changes
        if (mounted) {
          permissionCheckInterval = setInterval(async () => {
            const required = await isLocationPermissionRequired();
            if (required) {
              await checkAndNavigateToPermissionScreen();
            }
          }, 2000);
        }
      } catch (error) {
        console.error('[Location Wrapper] Error in initialization:', error);
      }
    };

    const initializeLocationServices = async () => {
      try {
        // Clear any stale location permissions state
        await AsyncStorage.removeItem('@location_permission_status');
        
        // Initialize location services
        await Location.requestForegroundPermissionsAsync()
          .catch(() => {}); // Ignore errors here, will handle in LocationPermissionScreen
        
        await Location.requestBackgroundPermissionsAsync()
          .catch(() => {}); // Ignore errors here, will handle in LocationPermissionScreen

        // Small delay to ensure everything is initialized
        await new Promise(resolve => setTimeout(resolve, 100));
        
        setIsReady(true);
      } catch (error) {
        console.error('Error initializing location services:', error);
        // Continue even if there's an error, permissions will be handled in LocationPermissionScreen
        setIsReady(true);
      }
    };

    // Start monitoring immediately when navigation is ready
    if (navigationState && navigation) {
      initializeLocationMonitoring();
    }

    initializeLocationServices();

    // Cleanup function
    return () => {
      mounted = false;
      if (monitoringCleanup) {
        monitoringCleanup();
      }
      if (permissionCheckInterval) {
        clearInterval(permissionCheckInterval);
      }
      if (workingHoursInterval) {
        clearInterval(workingHoursInterval);
      }
      if (settingsUnsubscribe) {
        settingsUnsubscribe();
      }
    };
  }, [navigation, navigationState]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return children;
};

export default LocationPermissionWrapper; 