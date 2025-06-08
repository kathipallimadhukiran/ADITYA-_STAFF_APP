import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput,
  Dimensions,
} from 'react-native';
import { Card } from 'react-native-paper';
import { firebase } from '../../services/Firebase/firebaseConfig';
import Icon from 'react-native-vector-icons/FontAwesome5';
import * as Location from 'expo-location';

export default function ViewLocationsScreen() {
  const [users, setUsers] = useState([]); // List of all users grouped by department
  const [departments, setDepartments] = useState([]); // List of unique departments
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  const getLocationName = async (latitude, longitude) => {
    try {
      console.log('Attempting to get location name for:', { latitude, longitude });
      
      if (!latitude || !longitude) {
        console.log('Invalid coordinates:', { latitude, longitude });
        return 'Invalid location coordinates';
      }

      const result = await Location.reverseGeocodeAsync({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      });

      console.log('Geocoding result:', result);

      if (result && result.length > 0) {
        const location = result[0];
        console.log('Location details:', location);
        
        // Simplified location name format
        const parts = [];
        if (location.name) parts.push(location.name);
        if (location.street) parts.push(location.street);
        if (location.subregion) parts.push(location.subregion);
        
        const locationName = parts.length > 0 ? parts.join(', ') : 'Unknown location';
        console.log('Final location name:', locationName);
        return locationName;
      }
      
      console.log('No location data found');
      return 'Location unavailable';
    } catch (error) {
      console.error('Error in getLocationName:', error);
      return 'Error getting location';
    }
  };

  // Function to fetch location data for a specific user
  const fetchUserLocation = async (email) => {
    try {
      setLocationLoading(true);
      const db = firebase.firestore();
      
      const locationDoc = await db
        .collection('locations') // Updated collection name to match LocationService
        .doc(email.toLowerCase())
        .get();

      if (locationDoc.exists) {
        const locationData = locationDoc.data();
        const currentLocation = locationData.currentLocation || {};
        
        // Get location name
        const locationName = await getLocationName(
          currentLocation.latitude,
          currentLocation.longitude
        );

        return {
          status: 'active',
          latitude: currentLocation.latitude || 0,
          longitude: currentLocation.longitude || 0,
          altitude: currentLocation.altitude || 0,
          lastUpdate: currentLocation.timestamp || null,
          locationName: locationName,
        };
      }
      return null;
    } catch (error) {
      console.error('Error fetching location:', error);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  // Function to fetch users grouped by department
  const fetchUsers = async () => {
    try {
      console.log('Fetching users...');
      const db = firebase.firestore();
      
      const usersSnapshot = await db
        .collection('users')
        .where('role', 'in', ['staff', 'admin'])
        .get();

      const usersByDepartment = {};
      const deptSet = new Set();

      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const dept = userData.department || 'Unassigned';
        deptSet.add(dept);

        if (!usersByDepartment[dept]) {
          usersByDepartment[dept] = [];
        }

        usersByDepartment[dept].push({
          id: doc.id,
          name: userData.name || 'Unknown User',
          email: userData.email,
          role: userData.role,
          department: dept
        });
      });

      setDepartments(Array.from(deptSet).sort());
      setUsers(usersByDepartment);
      setSelectedDepartment(null);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const handleUserSelect = async (user) => {
    const locationData = await fetchUserLocation(user.email);
    setSelectedUser({ ...user, ...locationData });
    setModalVisible(true);
  };

  // Function to format timestamp with status color
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return { text: 'No updates', color: '#DC3545' };
    
    let date;
    try {
      // Handle different timestamp formats
      if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'object' && timestamp.toDate) {
        // Handle Firestore Timestamp
        date = timestamp.toDate();
      } else if (typeof timestamp === 'string') {
        // Handle ISO string
        date = new Date(timestamp);
      } else {
        // Handle numeric timestamp
        date = new Date(timestamp);
      }

      // Check if date is valid
      if (isNaN(date.getTime())) {
        
        return { text: 'Invalid date', color: '#DC3545' };
      }

      const now = new Date();
      const diffMinutes = Math.floor((now - date) / (1000 * 60));
      
      let text = '';
      let color = '';
      
      if (diffMinutes < 5) {
        text = 'Just now';
        color = '#28A745'; // Green for very recent
      } else if (diffMinutes < 30) {
        text = `${diffMinutes} minutes ago`;
        color = '#28A745'; // Green for recent
      } else if (diffMinutes < 60) {
        text = '30+ minutes ago';
        color = '#FFC107'; // Yellow for semi-recent
      } else if (diffMinutes < 120) {
        text = '1 hour ago';
        color = '#FD7E14'; // Orange for old
      } else {
        // Format date for older timestamps
        const options = { 
          year: 'numeric', 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit'
        };
        text = date.toLocaleString(undefined, options);
        color = '#DC3545'; // Red for very old
      }
      
      return { text, color };
    } catch (error) {
      console.error('Error formatting timestamp:', error);
      return { text: 'Error formatting date', color: '#DC3545' };
    }
  };

  const renderDepartmentItem = ({ item: department }) => {
    const departmentUsers = users[department] || [];
    const filteredUsers = searchQuery
      ? departmentUsers.filter(user => 
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email.toLowerCase().includes(searchQuery.toLowerCase()))
      : departmentUsers;

    if (filteredUsers.length === 0) return null;

    return (
      <View style={styles.departmentSection}>
        <TouchableOpacity 
          style={styles.departmentHeader}
          onPress={() => setSelectedDepartment(
            selectedDepartment === department ? null : department
          )}
        >
          <Text style={styles.departmentTitle}>{department}</Text>
          <Icon 
            name={selectedDepartment === department ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#1D3557" 
          />
        </TouchableOpacity>

        {selectedDepartment === department && (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item: user }) => (
              <TouchableOpacity onPress={() => handleUserSelect(user)}>
                <Card style={styles.userCard}>
                  <Card.Content>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userRole}>{user.role.toUpperCase()}</Text>
                    </View>
                  </Card.Content>
                </Card>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  };

  const renderUserDetails = () => {
    if (!selectedUser) return null;

    const lastUpdate = formatTimestamp(selectedUser.lastUpdate);
    const isActive = lastUpdate.color === '#28A745';

    return (
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <Text style={styles.modalTitle}>{selectedUser.name}</Text>
                <View style={[styles.statusIndicator, { backgroundColor: lastUpdate.color }]} />
              </View>
              <TouchableOpacity 
                onPress={() => setModalVisible(false)}
                style={styles.closeButton}
              >
                <Icon name="times" size={20} color="#1D3557" />
              </TouchableOpacity>
            </View>

            {locationLoading ? (
              <ActivityIndicator size="large" color="#1D3557" />
            ) : (
              <>
                <View style={styles.staffInfo}>
                  <View style={styles.infoRow}>
                    <Icon name="user-tie" size={16} color="#457B9D" />
                    <Text style={styles.infoLabel}>Role:</Text>
                    <Text style={styles.infoValue}>{selectedUser.role}</Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Icon name="building" size={16} color="#457B9D" />
                    <Text style={styles.infoLabel}>Department:</Text>
                    <Text style={styles.infoValue}>{selectedUser.department}</Text>
                  </View>
                  
                  <View style={styles.infoRow}>
                    <Icon name="envelope" size={16} color="#457B9D" />
                    <Text style={styles.infoLabel}>Email:</Text>
                    <Text style={styles.infoValue}>{selectedUser.email}</Text>
                  </View>
                </View>

                {selectedUser.latitude && selectedUser.longitude && (
                  <View style={styles.locationCard}>
                    <View style={styles.locationHeader}>
                      <Icon name="map-marked-alt" size={20} color="#457B9D" />
                      <Text style={styles.locationHeaderText}>Location Details</Text>
                    </View>

                    <View style={styles.locationDetails}>
                      <View style={styles.locationRow}>
                        <Icon name="map-marker-alt" size={16} color="#457B9D" />
                        <View style={styles.locationTextContainer}>
                          <Text style={styles.locationName}>
                            {selectedUser.locationName || 'Location unavailable'}
                          </Text>
                          <Text style={styles.coordinatesText}>
                            {selectedUser.latitude.toFixed(6)}, {selectedUser.longitude.toFixed(6)}
                          </Text>
                        </View>
                      </View>
                      
                      <View style={styles.locationRow}>
                        <Icon name="mountain" size={16} color="#457B9D" />
                        <Text style={styles.locationText}>
                          Altitude: {selectedUser.altitude.toFixed(2)}m
                        </Text>
                      </View>

                      <View style={styles.updateInfo}>
                        <Icon 
                          name={isActive ? "signal" : "clock"} 
                          size={16} 
                          color={lastUpdate.color} 
                        />
                        <Text style={[styles.updateText, { color: lastUpdate.color }]}>
                          {lastUpdate.text}
                        </Text>
                      </View>
                    </View>
                  </View>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#6C757D" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#6C757D"
        />
        {searchQuery ? (
          <TouchableOpacity 
            onPress={() => setSearchQuery('')}
            style={styles.clearButton}
          >
            <Icon name="times-circle" size={20} color="#6C757D" />
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={departments}
        renderItem={renderDepartmentItem}
        keyExtractor={(item) => item}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1D3557']}
          />
        }
        contentContainerStyle={styles.listContainer}
      />

      {renderUserDetails()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1D3557',
  },
  clearButton: {
    padding: 8,
  },
  departmentSection: {
    marginBottom: 16,
  },
  departmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E9ECEF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  departmentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  userCard: {
    marginBottom: 8,
    elevation: 2,
    borderRadius: 8,
  },
  userInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  userRole: {
    fontSize: 12,
    color: '#457B9D',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    width: Dimensions.get('window').width * 0.9,
    maxHeight: Dimensions.get('window').height * 0.8,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  closeButton: {
    padding: 8,
  },
  staffInfo: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6C757D',
    marginLeft: 8,
    width: 80,
  },
  infoValue: {
    flex: 1,
    fontSize: 16,
    color: '#1D3557',
  },
  locationCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  locationHeaderText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D3557',
    marginLeft: 8,
  },
  locationDetails: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  locationTextContainer: {
    flex: 1,
    marginLeft: 8,
  },
  locationName: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  coordinatesText: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 2,
  },
  locationText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#2B2D42',
  },
  updateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  updateText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  listContainer: {
    paddingBottom: 16,
  },
}); 