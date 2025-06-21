import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, BackHandler, Alert } from 'react-native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { locationPermissionNavigationEmitter } from '../services/LocationService';

const LocationPermissionScreen = () => {
  const [permissionStatus, setPermissionStatus] = useState({
    foreground: null,
    background: null,
    services: null
  });
  
  const navigation = useNavigation();

  useEffect(() => {
    checkPermissions();

    // Prevent going back
    const backHandler = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        Alert.alert(
          'Exit App',
          'Location access is required to use this app. Do you want to exit?',
          [
            {
              text: 'Cancel',
              onPress: () => null,
              style: 'cancel',
            },
            { 
              text: 'Exit', 
              onPress: () => BackHandler.exitApp(),
              style: 'destructive'
            },
          ],
          { cancelable: false }
        );
        return true;
      }
    );

    // Subscribe to permission changes
    const subscription = locationPermissionNavigationEmitter.addListener(
      'requireLocationPermission',
      (required) => {
        if (required) {
          checkPermissions();
        }
      }
    );

    // Check permissions every 2 seconds
    const permissionCheckInterval = setInterval(checkPermissions, 2000);

    return () => {
      backHandler.remove();
      subscription.remove();
      clearInterval(permissionCheckInterval);
    };
  }, []);

  const checkPermissions = async () => {
    try {
      // Check foreground permission
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      
      // Check background permission
      const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
      
      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();

      setPermissionStatus({
        foreground: foregroundStatus,
        background: backgroundStatus,
        services: servicesEnabled
      });

      // If all permissions are granted, navigate back to app
      if (foregroundStatus === 'granted' && 
          backgroundStatus === 'granted' && 
          servicesEnabled) {
        // Get the previous route name or default to AdminDashboard
        const routeName = navigation.getState()?.routes?.[0]?.params?.returnTo || 'AdminDashboard';
        navigation.reset({
          index: 0,
          routes: [{ name: routeName }],
        });
      }
    } catch (error) {
      console.error('[Location Permission] Error checking permissions:', error);
    }
  };

  const handleEnableLocation = async () => {
    try {
      // Request foreground permission if not granted
      if (permissionStatus.foreground !== 'granted') {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          Alert.alert(
            'Location Permission Required',
            'This app requires location permission to track attendance. Please enable it in settings.',
            [
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings()
              },
              {
                text: 'Exit App',
                onPress: () => BackHandler.exitApp(),
                style: 'destructive'
              }
            ],
            { cancelable: false }
          );
          return;
        }
        setPermissionStatus(prev => ({ ...prev, foreground: foregroundStatus }));
      }

      // Request background permission if not granted
      if (permissionStatus.background !== 'granted') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          Alert.alert(
            'Background Location Required',
            'This app requires background location access to track attendance when the app is in background. Please enable it in settings.',
            [
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings()
              },
              {
                text: 'Exit App',
                onPress: () => BackHandler.exitApp(),
                style: 'destructive'
              }
            ],
            { cancelable: false }
          );
          return;
        }
        setPermissionStatus(prev => ({ ...prev, background: backgroundStatus }));
      }

      // Check if location services are enabled
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        if (Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
            setPermissionStatus(prev => ({ ...prev, services: true }));
          } catch (error) {
            Alert.alert(
              'Location Services Required',
              'Please enable location services in your device settings to continue.',
              [
                {
                  text: 'Open Settings',
                  onPress: () => Linking.openSettings()
                },
                {
                  text: 'Exit App',
                  onPress: () => BackHandler.exitApp(),
                  style: 'destructive'
                }
              ],
              { cancelable: false }
            );
            return;
          }
        } else {
          Alert.alert(
            'Location Services Required',
            'Please enable location services in your device settings to continue.',
            [
              {
                text: 'Open Settings',
                onPress: () => Linking.openSettings()
              },
              {
                text: 'Exit App',
                onPress: () => BackHandler.exitApp(),
                style: 'destructive'
              }
            ],
            { cancelable: false }
          );
          return;
        }
      }

      // Final check if all permissions are granted and services are enabled
      const finalStatus = await Location.hasServicesEnabledAsync();
      const finalForeground = await Location.getForegroundPermissionsAsync();
      const finalBackground = await Location.getBackgroundPermissionsAsync();

      if (finalStatus && 
          finalForeground.status === 'granted' && 
          finalBackground.status === 'granted') {
        // Get the previous route name or default to AdminDashboard
        const routeName = navigation.getState()?.routes?.[0]?.params?.returnTo || 'AdminDashboard';
        navigation.reset({
          index: 0,
          routes: [{ name: routeName }],
        });
      }
    } catch (error) {
      console.error('[Location Permission] Error in handleEnableLocation:', error);
    }
  };

  const getPermissionStatusText = () => {
    if (!permissionStatus.services) {
      return 'Location services are disabled. Please enable them in your device settings to track attendance.';
    }
    if (permissionStatus.foreground !== 'granted') {
      return 'Location permission is required to track your attendance during duty hours.';
    }
    if (permissionStatus.background !== 'granted') {
      return 'Background location permission is required to track your attendance even when the app is not open.';
    }
    return 'Please enable all location permissions to continue using the app.';
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="location-off" size={100} color="#FF6B6B" style={styles.icon} />
        <Text style={styles.title}>Location Access Required</Text>
        <Text style={styles.description}>
          {getPermissionStatusText()}
        </Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={handleEnableLocation}
        >
          <Text style={styles.buttonText}>Enable Location Access</Text>
        </TouchableOpacity>
        <Text style={styles.note}>
          You cannot use the app during duty hours without enabling location services.
        </Text>
        <TouchableOpacity 
          style={styles.exitButton}
          onPress={() => BackHandler.exitApp()}
        >
          <Text style={styles.exitButtonText}>Exit App</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  icon: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
    color: '#333',
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#666',
    lineHeight: 24,
  },
  button: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  note: {
    marginTop: 24,
    marginBottom: 24,
    fontSize: 14,
    color: '#FF6B6B',
    textAlign: 'center',
    lineHeight: 20,
  },
  exitButton: {
    paddingVertical: 12,
    width: '100%',
  },
  exitButtonText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  }
});

export default LocationPermissionScreen; 