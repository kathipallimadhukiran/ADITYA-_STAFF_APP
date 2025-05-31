import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { fetchUser } from '../../services/Firebase/firestoreService';
import { getAuth } from "../../services/Firebase/firebaseConfig";
import AsyncStorage from '@react-native-async-storage/async-storage';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const emailParam = route.params?.email || null;
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFullImage, setShowFullImage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadUserData = async () => {
    if (!emailParam) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchUser(emailParam);
      if (data) {
        setUserData(data);
      } else {
        setUserData(null);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
      Alert.alert('Error', 'Failed to load user data');
      setUserData(null);
    } finally {
      setLoading(false);
    }
  };

  // Auto refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadUserData();
    }, [emailParam])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadUserData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [emailParam]);

  const handleEditPhoto = () => {
    Alert.alert('Feature Not Available', 'Photo editing is currently not available.');
  };

  const processImageUpload = async (imageUri) => {
    Alert.alert('Feature Not Available', 'Photo upload is currently not available.');
  };

  const handleFaceCapture = () => {
    if (userData) {
      navigation.navigate('FaceCaptureScreen', { 
        userId: route.params?.userId || userData.email.toLowerCase(),
        userName: route.params?.userName || userData.name,
        email: userData.email,
        userData: userData
      });
    }
  };

  const handleEditProfile = () => {
    if (userData) navigation.navigate('EditProfile', { userData });
  };

  const handleLogout = async () => {
    try {
      const auth = getAuth();
      if (!auth) {
        throw new Error("Auth not initialized");
      }
      await auth.signOut();
      await AsyncStorage.removeItem("@auth_user");
      console.log("User signed out!");
      
      // Instead of using navigation.reset, we'll let App.js handle the navigation
      // The onAuthStateChanged listener in App.js will detect the signOut
      // and automatically show the login screen
    } catch (error) {
      console.error("Logout Error:", error);
      Alert.alert("Error", "Failed to logout. Please try again.");
    }
  };

  const DetailItem = ({ icon, label, value }) => (
    <View style={styles.detailRow}>
      <Icon name={icon} size={18} color="#457B9D" style={styles.detailIcon} />
      <View>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value || 'N/A'}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  if (!userData) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#1D3557', fontSize: 16 }}>No user data found.</Text>
      </View>
    );
  }

  const getRoleSpecificDetails = () => {
    switch (userData.role) {
      case 'staff':
        return (
          <>
            <DetailItem icon="id-card" label="Staff ID" value={userData.id} />
            <DetailItem icon="building" label="Department" value={userData.department} />
            <DetailItem icon="graduation-cap" label="Qualifications" value={userData.qualifications} />
          </>
        );
      case 'student':
        return (
          <>
            <DetailItem icon="id-card" label="Student ID" value={userData.id} />
            <DetailItem icon="graduation-cap" label="Course" value={userData.course} />
            <DetailItem icon="calendar" label="Year" value={userData.year} />
          </>        );
      case 'admin':
        return (
          <>
            <DetailItem icon="id-badge" label="Admin ID" value={userData.id} />
            <DetailItem icon="user-shield" label="Access Level" value={userData.accessLevel} />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#1D3557']}
          tintColor="#1D3557"
        />
      }
    >
      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.logoutTopButton} onPress={handleLogout}>
          <Icon name="sign-out-alt" size={18} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.avatarContainer}>
          <TouchableOpacity onPress={() => setShowFullImage(true)}>
            <Image
              source={
                userData.profilePhoto
                  ? { uri: userData.profilePhoto }
                  : require('../../assets/default-profile.jpg')
              }
              style={styles.avatar}
              resizeMode="cover"
            />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.editPhotoButton} 
            onPress={handleEditPhoto}
          >
            <Icon name="camera" size={16} color="#1D3557" />
          </TouchableOpacity>
        </View>

        <Modal
          visible={showFullImage}
          transparent={true}
          onRequestClose={() => setShowFullImage(false)}
        >
          <TouchableOpacity 
            style={styles.modalContainer} 
            activeOpacity={1} 
            onPress={() => setShowFullImage(false)}
          >
            <Image
              source={
                userData.profilePhoto
                  ? { uri: userData.profilePhoto }
                  : require('../../assets/default-profile.jpg')
              }
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowFullImage(false)}
            >
              <Icon name="times" size={24} color="#fff" />
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        <Text style={styles.name}>{userData.name}</Text>
        <Text style={styles.role}>{userData.role.charAt(0).toUpperCase() + userData.role.slice(1)}</Text>

        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Icon name="pen" size={14} color="#fff" />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        {userData.role !== 'student' && (
          <TouchableOpacity style={styles.faceCaptureButton} onPress={handleFaceCapture}>
            <Icon name="camera-retro" size={14} color="#fff" />
            <Text style={styles.faceCaptureButtonText}>Update Face ID</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Basic Information</Text>
        <DetailItem icon="envelope" label="Email" value={userData.email} />
        <DetailItem icon="phone" label="Phone" value={userData.phoneNumber} />
        {getRoleSpecificDetails()}
      </View>

      {userData.bio && (
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{userData.bio}</Text>
        </View>
      )}

      {userData.emergencyContact && (
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Emergency Contact</Text>
          <DetailItem 
            icon="user-shield" 
            label="Contact Person" 
            value={userData.emergencyContact.name} 
          />
          <DetailItem 
            icon="phone-alt" 
            label="Emergency Number" 
            value={userData.emergencyContact.phone} 
          />
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
    backgroundColor: '#1D3557',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#fff',
  },
  editPhotoButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    borderWidth: 2,
    borderColor: '#1D3557',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  role: {
    fontSize: 18,
    color: '#A8DADC',
    marginBottom: 3,
  },
  editButton: {
    flexDirection: 'row',
    backgroundColor: '#457B9D',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 3,
    marginBottom: 10,
  },
  editButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  faceCaptureButton: {
    flexDirection: 'row',
    backgroundColor: '#2EC4B6',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 3,
    marginBottom: 10,
  },
  faceCaptureButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginLeft: 8,
  },
  detailsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    paddingBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'center',
  },
  detailIcon: {
    width: 40,
  },
  detailLabel: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: '#212529',
    fontWeight: '500',
  },
  bioText: {
    fontSize: 15,
    color: '#495057',
    lineHeight: 22,
  },
  logoutTopButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 20,
    zIndex: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '80%',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 25,
    zIndex: 10,
  },
});

export default ProfileScreen;
