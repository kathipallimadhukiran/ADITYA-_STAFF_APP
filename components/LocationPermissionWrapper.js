import React, { useEffect } from 'react';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { isLocationPermissionRequired, monitorLocationServices, checkWorkingHours } from '../services/LocationService';
import { db } from '../services/Firebase/firebaseConfig';

const LocationPermissionWrapper = ({ children }) => {
  const navigation = useNavigation();
  const navigationState = useNavigationState(state => state);

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

        // Check if we're in working hours
        const workingHoursCheck = await checkWorkingHours(true); // Force fresh check
        
        // Only enforce location during working hours
        if (workingHoursCheck.isWithinWorkingHours) {
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

    // Start monitoring immediately when navigation is ready
    if (navigationState && navigation) {
      initializeLocationMonitoring();
    }

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

  return children;
};

export default LocationPermissionWrapper; 