import React, { useState, useEffect, useRef } from 'react';
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
  Linking,
  Platform,
  Image,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { Card } from 'react-native-paper';
import { firebase } from '../../services/Firebase/firebaseConfig';
import Icon from 'react-native-vector-icons/FontAwesome5';
import * as Location from 'expo-location';
import { WebView } from 'react-native-webview';
import { API_ENDPOINTS } from '../../config/apiConfig';

export default function ViewLocationsScreen() {
  const [usersByRole, setUsersByRole] = useState({}); // Users grouped by role then department
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const [dot1Opacity] = useState(new Animated.Value(0.3));
  const [dot2Opacity] = useState(new Animated.Value(0.3));
  const [dot3Opacity] = useState(new Animated.Value(0.3));

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
      
      // First get the user document to get the phone number
      const userDoc = await db
        .collection('users')
        .doc(email.toLowerCase())
        .get();

      const userData = userDoc.exists ? userDoc.data() : {};

      // Fetch location from our API endpoint
              const response = await fetch(`${API_ENDPOINTS.location.getByEmail(email)}`);
      const locationData = await response.json();

      if (locationData.success && locationData.data) {
        const currentLocation = locationData.data.currentLocation || {};
        
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
          phoneNumber: userData.phoneNumber || 'Not available'  // Include phone number from user document
        };
      }

      return {
        phoneNumber: userData.phoneNumber || 'Not available'  // Include phone number even if location doesn't exist
      };
    } catch (error) {
      console.error('Error fetching location:', error);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  // Function to fetch users grouped by role and department
  const fetchUsers = async () => {
    try {
      console.log('Fetching users...');
      const db = firebase.firestore();
      
      const usersSnapshot = await db
        .collection('users')
        .where('role', 'in', ['staff', 'admin', 'faculty'])
        .get();

      const groupedUsers = {};
      
      usersSnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const role = userData.role || 'Unassigned';
        const dept = userData.department || 'Unassigned';

        if (!groupedUsers[role]) {
          groupedUsers[role] = {};
        }
        
        if (!groupedUsers[role][dept]) {
          groupedUsers[role][dept] = [];
        }

        groupedUsers[role][dept].push({
          id: doc.id,
          name: userData.name || 'Unknown User',
          email: userData.email,
          role: role,
          department: dept,
          profilePhoto: userData.profilePhoto || null,
          phoneNumber: userData.phoneNumber || 'Not available'
        });
      });

      setUsersByRole(groupedUsers);
      setSelectedRole(null);
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

  useEffect(() => {
    const startAnimations = () => {
      // Rotation animation
      Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();

      // Opacity animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.6,
            duration: 1000,
            easing: Easing.ease,
            useNativeDriver: true,
          })
        ])
      ).start();
    };

    startAnimations();
  }, []);

  useEffect(() => {
    const animateDots = () => {
      const duration = 600;
      
      Animated.loop(
        Animated.sequence([
          // First dot
          Animated.sequence([
            Animated.timing(dot1Opacity, {
              toValue: 1,
              duration: duration / 3,
              useNativeDriver: true,
            }),
            Animated.timing(dot1Opacity, {
              toValue: 0.3,
              duration: duration / 3,
              useNativeDriver: true,
            }),
          ]),
          // Second dot
          Animated.sequence([
            Animated.timing(dot2Opacity, {
              toValue: 1,
              duration: duration / 3,
              useNativeDriver: true,
            }),
            Animated.timing(dot2Opacity, {
              toValue: 0.3,
              duration: duration / 3,
              useNativeDriver: true,
            }),
          ]),
          // Third dot
          Animated.sequence([
            Animated.timing(dot3Opacity, {
              toValue: 1,
              duration: duration / 3,
              useNativeDriver: true,
            }),
            Animated.timing(dot3Opacity, {
              toValue: 0.3,
              duration: duration / 3,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    };

    if (locationLoading) {
      animateDots();
    }
  }, [locationLoading]);

  const spin = rotationAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers();
  };

  const handleUserSelect = async (user) => {
    setSelectedUser(user); // Set the user data immediately
    setLocationLoading(true); // Show loading state
    setModalVisible(true); // Show modal immediately
    
    const locationData = await fetchUserLocation(user.email);
    setSelectedUser(prev => ({ ...prev, ...locationData })); // Update with location data
    setLocationLoading(false);
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

  // Function to open location in maps
  const openInMaps = (latitude, longitude) => {
    const scheme = Platform.select({
      ios: 'maps:',
      android: 'geo:'
    });
    const latLng = `${latitude},${longitude}`;
    const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${latLng}`;
    const mapsUrl = Platform.select({
      ios: `${scheme}${latLng}`,
      android: `${scheme}${latLng}`
    });

    // Try to open in Google Maps first, fallback to native maps
    Linking.canOpenURL(googleMapsUrl)
      .then(supported => {
        if (supported) {
          return Linking.openURL(googleMapsUrl);
        }
        return Linking.openURL(mapsUrl);
      })
      .catch(err => console.error('Error opening maps:', err));
  };

  const renderRoleSection = ({ item: role }) => {
    const departmentsInRole = Object.keys(usersByRole[role] || {});
    
    // Filter departments that have matching users based on search query
    const filteredDepartments = departmentsInRole.filter(dept => {
      const usersInDept = usersByRole[role][dept];
      return searchQuery
        ? usersInDept.some(user =>
            user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase()))
        : true;
    });

    if (filteredDepartments.length === 0) return null;

    return (
      <View style={styles.roleSection}>
        <TouchableOpacity 
          style={[
            styles.roleHeader,
            selectedRole === role && styles.selectedHeader
          ]}
          onPress={() => setSelectedRole(selectedRole === role ? null : role)}
        >
          <View style={styles.roleHeaderContent}>
            <Icon 
              name={role === 'admin' ? 'user-shield' : role === 'faculty' ? 'chalkboard-teacher' : 'user'}
              size={18}
              color="#1D3557"
              style={styles.roleIcon}
            />
            <Text style={styles.roleTitle}>{role.toUpperCase()}</Text>
          </View>
          <Icon 
            name={selectedRole === role ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#1D3557" 
          />
        </TouchableOpacity>

        {selectedRole === role && (
          <View style={styles.departmentsContainer}>
            {filteredDepartments.map(department => (
              <View key={department} style={styles.departmentSection}>
                <TouchableOpacity 
                  style={[
                    styles.departmentHeader,
                    selectedDepartment === department && styles.selectedDepartment
                  ]}
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
                    data={usersByRole[role][department].filter(user =>
                      searchQuery
                        ? user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchQuery.toLowerCase())
                        : true
                    )}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item: user }) => (
                      <TouchableOpacity onPress={() => handleUserSelect(user)}>
                        <Card style={styles.userCard}>
                          <Card.Content>
                            <View style={styles.userInfo}>
                              <View style={styles.userBasicInfo}>
                                <View style={styles.avatarContainer}>
                                  {user.profilePhoto ? (
                                    <Image
                                      source={{ uri: user.profilePhoto }}
                                      style={styles.userAvatar}
                                    />
                                  ) : (
                                    <View style={[styles.userAvatar, styles.defaultAvatar]}>
                                      <Icon name="user" size={20} color="#457B9D" />
                                    </View>
                                  )}
                                </View>
                                <View style={styles.userTextInfo}>
                                  <Text style={styles.userName}>{user.name}</Text>
                                  <Text style={styles.userEmail}>{user.email}</Text>
                                </View>
                              </View>
                              <Icon name="chevron-right" size={16} color="#6C757D" />
                            </View>
                          </Card.Content>
                        </Card>
                      </TouchableOpacity>
                    )}
                  />
                )}
              </View>
            ))}
          </View>
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
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <View style={styles.headerLeft}>
                  <View style={styles.modalAvatarContainer}>
                    {selectedUser.profilePhoto ? (
                      <Image
                        source={{ uri: selectedUser.profilePhoto }}
                        style={styles.modalAvatar}
                      />
                    ) : (
                      <View style={[styles.modalAvatar, styles.defaultAvatar]}>
                        <Icon name="user" size={24} color="#457B9D" />
                      </View>
                    )}
                    <Animated.View 
                      style={[
                        styles.modalStatusStroke,
                        {
                          opacity: opacityAnim,
                          transform: [{ rotate: spin }]
                        }
                      ]} 
                    />
                    <Animated.View 
                      style={[
                        styles.modalStatusStrokeGlow,
                        {
                          opacity: opacityAnim,
                        }
                      ]} 
                    />
                  </View>
                  <View style={styles.headerTextContainer}>
                    <Text style={styles.modalTitle}>{selectedUser.name}</Text>
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => setModalVisible(false)}
                  style={styles.closeButton}
                >
                  <Icon name="times" size={20} color="#1D3557" />
                </TouchableOpacity>
              </View>

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

                <View style={styles.infoRow}>
                  <Icon name="phone" size={16} color="#457B9D" />
                  <Text style={styles.infoLabel}>Phone:</Text>
                  <Text style={styles.infoValue}>{selectedUser.phoneNumber}</Text>
                  <TouchableOpacity 
                    style={styles.callButton}
                    onPress={() => Linking.openURL(`tel:${selectedUser.phoneNumber}`)}
                  >
                    <Icon name="phone" size={16} color="#FFFFFF" />
                    <Text style={styles.callButtonText}>Call</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {locationLoading ? (
                <View style={styles.loadingLocationContainer}>
                  <ActivityIndicator size="large" color="#1D3557" />
                  <Text style={styles.loadingText}>
                    Tracking {selectedUser.name}'s location...
                  </Text>
                  <View style={styles.loadingDotsContainer}>
                    <Animated.View style={[styles.loadingDot, { opacity: dot1Opacity }]} />
                    <Animated.View style={[styles.loadingDot, { opacity: dot2Opacity }]} />
                    <Animated.View style={[styles.loadingDot, { opacity: dot3Opacity }]} />
                  </View>
                </View>
              ) : (
                selectedUser.latitude && selectedUser.longitude && (
                  <View style={styles.locationCard}>
                    <View style={styles.locationHeader}>
                      <Icon name="map-marked-alt" size={20} color="#457B9D" />
                      <Text style={styles.locationHeaderText}>Location Details</Text>
                    </View>

                    <View style={styles.locationDetails}>
                      <View style={styles.mapContainer}>
                        <WebView
                          style={styles.map}
                          source={{
                            html: `
                              <!DOCTYPE html>
                              <html>
                                <head>
                                  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
                                  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.7.1/dist/leaflet.css" />
                                  <script src="https://unpkg.com/leaflet@1.7.1/dist/leaflet.js"></script>
                                  <style>
                                    html, body {
                                      margin: 0;
                                      padding: 0;
                                      width: 100%;
                                      height: 100%;
                                      background: #f5f5f5;
                                    }
                                    #map {
                                      width: 100%;
                                      height: 100%;
                                      background: #f5f5f5;
                                    }
                                  </style>
                                </head>
                                <body>
                                  <div id="map"></div>
                                  <script>
                                    try {
                                      // Initialize the map
                                      var map = L.map('map', {
                                        zoomControl: true,
                                        attributionControl: false
                                      }).setView([${selectedUser.latitude}, ${selectedUser.longitude}], 18);

                                      // Add the satellite layer
                                      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                                        maxZoom: 19
                                      }).addTo(map);

                                      // Add a marker
                                      var marker = L.marker([${selectedUser.latitude}, ${selectedUser.longitude}])
                                        .addTo(map)
                                        .bindPopup("${selectedUser.name}<br>${selectedUser.locationName || 'Location unavailable'}")
                                        .openPopup();

                                      // Notify React Native that map is loaded
                                      window.ReactNativeWebView.postMessage('Map loaded successfully');
                                    } catch (error) {
                                      window.ReactNativeWebView.postMessage('Error: ' + error.message);
                                    }
                                  </script>
                                </body>
                              </html>
                            `
                          }}
                          onMessage={(event) => {
                            console.log('WebView message:', event.nativeEvent.data);
                          }}
                          onError={(syntheticEvent) => {
                            const { nativeEvent } = syntheticEvent;
                            console.warn('WebView error:', nativeEvent);
                          }}
                          onHttpError={(syntheticEvent) => {
                            const { nativeEvent } = syntheticEvent;
                            console.warn('WebView HTTP error:', nativeEvent);
                          }}
                          renderLoading={() => (
                            <View style={[styles.mapContainer, styles.loadingContainer]}>
                              <ActivityIndicator size="large" color="#1D3557" />
                            </View>
                          )}
                          startInLoadingState={true}
                          javaScriptEnabled={true}
                          domStorageEnabled={true}
                          scalesPageToFit={true}
                          scrollEnabled={false}
                          bounces={false}
                          showsHorizontalScrollIndicator={false}
                          showsVerticalScrollIndicator={false}
                        />
                      </View>

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

                      <View style={styles.metricRow}>
                        <Icon name="mountain" size={16} color="#457B9D" />
                        <Text style={styles.metricLabel}>Altitude:</Text>
                        <Text style={styles.metricValue}>{selectedUser.altitude?.toFixed(2)}m</Text>
                      </View>

                      <TouchableOpacity 
                        style={styles.mapsButton}
                        onPress={() => openInMaps(selectedUser.latitude, selectedUser.longitude)}
                      >
                        <Icon name="directions" size={16} color="#FFFFFF" />
                        <Text style={styles.mapsButtonText}>Open in Maps</Text>
                      </TouchableOpacity>

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
                )
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // Add this new function to render search results
  const renderSearchResults = () => {
    const allUsers = [];
    Object.keys(usersByRole).forEach(role => {
      Object.keys(usersByRole[role]).forEach(dept => {
        allUsers.push(...usersByRole[role][dept]);
      });
    });

    const filteredUsers = allUsers.filter(user =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={({ item: user }) => (
          <TouchableOpacity onPress={() => handleUserSelect(user)}>
            <Card style={styles.userCard}>
              <Card.Content>
                <View style={styles.userInfo}>
                  <View style={styles.userBasicInfo}>
                    <View style={styles.avatarContainer}>
                      {user.profilePhoto ? (
                        <Image
                          source={{ uri: user.profilePhoto }}
                          style={styles.userAvatar}
                        />
                      ) : (
                        <View style={[styles.userAvatar, styles.defaultAvatar]}>
                          <Icon name="user" size={20} color="#457B9D" />
                        </View>
                      )}
                    </View>
                    <View style={styles.userTextInfo}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userEmail}>{user.email}</Text>
                    </View>
                  </View>
                  <Icon name="chevron-right" size={16} color="#6C757D" />
                </View>
              </Card.Content>
            </Card>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContainer}
      />
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

      {searchQuery ? (
        renderSearchResults()
      ) : (
        <FlatList
          data={Object.keys(usersByRole)}
          renderItem={renderRoleSection}
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
      )}

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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
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
    placeholderTextColor: '#6C757D',
  },
  clearButton: {
    padding: 8,
  },
  roleSection: {
    marginBottom: 16,
  },
  roleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#E9ECEF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  roleHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleIcon: {
    marginRight: 12,
  },
  roleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  selectedHeader: {
    backgroundColor: '#457B9D',
  },
  departmentsContainer: {
    marginLeft: 16,
  },
  departmentSection: {
    marginBottom: 8,
  },
  departmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedDepartment: {
    backgroundColor: '#E3E3E3',
  },
  departmentTitle: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  userEmail: {
    fontSize: 12,
    color: '#6C757D',
    marginTop: 2,
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
  userBasicInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  modalAvatarContainer: {
    position: 'relative',
    marginRight: 16,
  },
  modalAvatar: {
    width: Dimensions.get('window').width * 0.15,
    height: Dimensions.get('window').width * 0.15,
    borderRadius: Dimensions.get('window').width * 0.075,
    maxWidth: 60,
    maxHeight: 60,
  },
  modalStatusStroke: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#28A745',
    borderStyle: 'solid',
  },
  modalStatusStrokeGlow: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#28A745',
    shadowColor: '#28A745',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 5,
    elevation: 5,
  },
  statusDots: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 26,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  modalStatusDots: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 36,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    transform: [{ rotate: '45deg' }],
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#28A745',
    opacity: 0.8,
  },
  defaultAvatar: {
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userTextInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: Math.min(20, Dimensions.get('window').width * 0.05),
    padding: Math.min(10, Dimensions.get('window').width * 0.03),
    width: Dimensions.get('window').width > 600 ? 580 : Dimensions.get('window').width * 0.9,
    maxHeight: Dimensions.get('window').height * 0.85,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Math.min(15, Dimensions.get('window').height * 0.02),
    marginTop: Math.min(10, Dimensions.get('window').height * 0.015),
    marginLeft: Math.min(10, Dimensions.get('window').width * 0.03),
    marginRight: Math.min(10, Dimensions.get('window').width * 0.03),
  },
  modalTitle: {
    fontSize: Math.min(24, Dimensions.get('window').width * 0.06),
    fontWeight: 'bold',
    color: '#1D3557',
  },
  closeButton: {
    padding: 8,
  },
  staffInfo: {
    backgroundColor: '#F8F9FA',
    borderRadius: Math.min(12, Dimensions.get('window').width * 0.03),
    padding: Math.min(16, Dimensions.get('window').width * 0.04),
    marginBottom: Math.min(20, Dimensions.get('window').height * 0.025),
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
    borderRadius: Math.min(12, Dimensions.get('window').width * 0.03),
    padding: Math.min(16, Dimensions.get('window').width * 0.04),
    marginTop: Math.min(10, Dimensions.get('window').height * 0.015),
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
  mapContainer: {
    height: Math.min(200, Dimensions.get('window').height * 0.25),
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: '#f5f5f5',
  },
  map: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
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
    fontSize: Math.min(16, Dimensions.get('window').width * 0.04),
    color: '#1D3557',
    fontWeight: '500',
  },
  coordinatesText: {
    fontSize: Math.min(12, Dimensions.get('window').width * 0.03),
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
  mapsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#457B9D',
    padding: Math.min(12, Dimensions.get('window').width * 0.03),
    borderRadius: 8,
    marginTop: Math.min(12, Dimensions.get('window').height * 0.015),
    marginBottom: Math.min(8, Dimensions.get('window').height * 0.01),
  },
  mapsButtonText: {
    color: '#FFFFFF',
    fontSize: Math.min(16, Dimensions.get('window').width * 0.04),
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingLocationContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: Math.min(12, Dimensions.get('window').width * 0.03),
    marginTop: Math.min(10, Dimensions.get('window').height * 0.015),
    minHeight: 150,
  },
  loadingText: {
    marginTop: 15,
    fontSize: Math.min(16, Dimensions.get('window').width * 0.04),
    color: '#1D3557',
    fontWeight: '500',
    textAlign: 'center',
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    marginTop: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1D3557',
    marginHorizontal: 4,
    opacity: 0.3,
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28A745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  callButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
    backgroundColor: '#F8F9FA',
    padding: 12,
    borderRadius: 8,
  },
  metricLabel: {
    fontSize: 14,
    color: '#6C757D',
    marginLeft: 8,
    width: 80,
  },
  metricValue: {
    flex: 1,
    fontSize: 14,
    color: '#1D3557',
    fontWeight: '500',
  },
}); 