import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { getAuth } from 'firebase/auth';
import { db } from '../../services/Firebase/firebaseConfig';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import * as Location from 'expo-location';

const LocationTracker = () => {
  const [location, setLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('offline');
  const [lastUpdate, setLastUpdate] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    let locationSubscription = null;

    const getLocationAsync = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        // Request permissions
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          setLoading(false);
          return;
        }

        // Get current position
        let currentLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setLocation(currentLocation);
        setStatus('active');
        setLastUpdate(new Date());

        // Save to Firestore
        if (currentUser) {
          await addDoc(collection(db, 'locations'), {
            userId: currentUser.uid,
            userRole: 'staff',
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
            status: 'active',
            timestamp: serverTimestamp(),
            location: 'Current Location',
          });
        }

        // Start watching position
        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 5000,
            distanceInterval: 10,
          },
          (newLocation) => {
            setLocation(newLocation);
            setLastUpdate(new Date());
          }
        );
      } catch (error) {
        console.error('Error:', error);
        setErrorMsg(error.message || 'Error getting location');
      } finally {
        setLoading(false);
      }
    };

    getLocationAsync();

    // Cleanup
    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, []);

  const updateLocation = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      
      setLocation(location);
      setStatus('active');
      setLastUpdate(new Date());

      if (currentUser) {
        await addDoc(collection(db, 'locations'), {
          userId: currentUser.uid,
          userRole: 'staff',
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          status: 'active',
          timestamp: serverTimestamp(),
          location: 'Current Location',
        });
      }
    } catch (error) {
      console.error('Error updating location:', error);
      setErrorMsg('Failed to update location');
      Alert.alert('Error', 'Failed to get current location');
    } finally {
      setLoading(false);
    }
  };

  const formatLastUpdate = (date) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#2EC4B6';
      case 'away':
        return '#FF9F1C';
      case 'offline':
        return '#F94144';
      default:
        return '#6C757D';
    }
  };

  if (loading && !location) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Tracker</Text>
      
      {errorMsg ? (
        <Card style={[styles.statusCard, styles.errorCard]}>
          <Card.Content>
            <View style={styles.errorContent}>
              <Icon name="exclamation-circle" size={24} color="#F94144" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          </Card.Content>
        </Card>
      ) : null}
      
      <Card style={styles.statusCard}>
        <Card.Content>
          <View style={styles.statusHeader}>
            <Text style={styles.statusTitle}>Current Status</Text>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>
          
          <View style={styles.locationInfo}>
            {location ? (
              <>
                <View style={styles.infoRow}>
                  <Icon name="map-marker-alt" size={14} color="#666" />
                  <Text style={styles.locationText}>
                    Lat: {location.coords.latitude.toFixed(6)}{'\n'}
                    Long: {location.coords.longitude.toFixed(6)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="clock" size={14} color="#666" />
                  <Text style={styles.timeText}>
                    Last updated: {formatLastUpdate(lastUpdate)}
                  </Text>
                </View>
              </>
            ) : (
              <Text style={styles.noLocationText}>
                {errorMsg || 'Location not available. Please enable location services.'}
              </Text>
            )}
          </View>
        </Card.Content>
      </Card>

      <TouchableOpacity 
        style={[styles.updateButton, loading && styles.disabledButton]}
        onPress={updateLocation}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.buttonText}>Update Location</Text>
        )}
      </TouchableOpacity>

      <Card style={styles.infoCard}>
        <Card.Content>
          <Text style={styles.infoTitle}>Location Tracking Info</Text>
          <Text style={styles.infoText}>
            Your location is only shared while you are on duty and will be used for administrative purposes only.
            You can update your status manually or it will be updated automatically based on your activity.
          </Text>
        </Card.Content>
      </Card>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  statusCard: {
    marginBottom: 16,
    elevation: 2,
    borderRadius: 8,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  locationInfo: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  locationText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  timeText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  noLocationText: {
    color: '#F94144',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
  updateButton: {
    backgroundColor: '#1D3557',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoCard: {
    marginTop: 16,
    elevation: 2,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  errorCard: {
    backgroundColor: '#FFF3F3',
    marginBottom: 12,
  },
  errorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  errorText: {
    color: '#F94144',
    marginLeft: 12,
    fontSize: 14,
    flex: 1,
  },
  disabledButton: {
    opacity: 0.7,
  },
});

export default LocationTracker; 