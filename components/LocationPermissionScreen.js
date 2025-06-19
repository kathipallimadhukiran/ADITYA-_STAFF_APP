import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import { MaterialIcons } from '@expo/vector-icons';

const LocationPermissionScreen = ({ onPermissionGranted }) => {
  const [permissionStatus, setPermissionStatus] = useState({
    foreground: null,
    background: null,
    services: null
  });

  useEffect(() => {
    checkPermissions();
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
    } catch (error) {
      console.error('[DEBUG] Error checking permissions:', error);
    }
  };

  const handleEnableLocation = async () => {
    try {
      // Request foreground permission if not granted
      if (permissionStatus.foreground !== 'granted') {
        const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
        if (foregroundStatus !== 'granted') {
          Linking.openSettings();
          return;
        }
        setPermissionStatus(prev => ({ ...prev, foreground: foregroundStatus }));
      }

      // Request background permission if not granted
      if (permissionStatus.background !== 'granted') {
        const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
        if (backgroundStatus !== 'granted') {
          Linking.openSettings();
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
            console.log('[DEBUG] Error enabling location services:', error);
            Linking.openSettings();
            return;
          }
        } else {
          Linking.openSettings();
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
        // All permissions are granted and services are enabled
        onPermissionGranted();
      }
    } catch (error) {
      console.error('[DEBUG] Error in handleEnableLocation:', error);
    }
  };

  const getPermissionStatusText = () => {
    if (!permissionStatus.services) {
      return 'Location services are disabled. Please enable them in your device settings.';
    }
    if (permissionStatus.foreground !== 'granted') {
      return 'Location permission is required to track attendance.';
    }
    if (permissionStatus.background !== 'granted') {
      return 'Background location permission is required for continuous tracking.';
    }
    return 'Please enable location access to continue.';
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <MaterialIcons name="location-on" size={100} color="#4CAF50" style={styles.icon} />
        <Text style={styles.title}>Location Access Required</Text>
        <Text style={styles.description}>
          {getPermissionStatusText()}
        </Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={handleEnableLocation}
        >
          <Text style={styles.buttonText}>Enable Location</Text>
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
    maxWidth: 300,
  },
  icon: {
    marginBottom: 20,
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
    marginBottom: 24,
    color: '#666',
    lineHeight: 22,
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});

export default LocationPermissionScreen; 