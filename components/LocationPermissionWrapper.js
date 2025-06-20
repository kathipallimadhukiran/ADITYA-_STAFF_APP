import React, { useEffect } from 'react';
import { useNavigation, useNavigationState } from '@react-navigation/native';
import { isLocationPermissionRequired, monitorLocationServices, checkWorkingHours } from '../services/LocationService';

const LocationPermissionWrapper = ({ children }) => {
  const navigation = useNavigation();
  const navigationState = useNavigationState(state => state);

  useEffect(() => {
    let mounted = true;
    let monitoringCleanup = null;
    let permissionCheckInterval = null;

    const checkAndNavigateToPermissionScreen = async () => {
      try {
        // Skip permission check for LocationPermissionScreen itself
        const currentRoute = navigation.getCurrentRoute();
        if (currentRoute?.name === 'LocationPermissionScreen') {
          return;
        }

        // Check if we're in working hours
        const workingHoursCheck = await checkWorkingHours();
        
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

        // Set up periodic checks every 2 seconds
        if (mounted) {
          permissionCheckInterval = setInterval(checkAndNavigateToPermissionScreen, 2000);
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
    };
  }, [navigation, navigationState]);

  return children;
};

export default LocationPermissionWrapper; 