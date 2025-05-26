import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation, useRoute } from '@react-navigation/native';

const StaffProfileScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();

  const staff = route.params?.staff || {
    id: 'EMP001',
    name: 'Dr. Sarah Johnson',
    role: 'Senior Lecturer',
    department: 'Computer Science',
    email: 's.johnson@university.edu',
    phone: '+1 (555) 123-4567',
    joinDate: '15 March 2018',
    office: 'Block B, Room 205',
    qualifications: 'PhD in Computer Science, M.Sc. in AI',
    bio: 'Specialized in Artificial Intelligence and Machine Learning with 10+ years of teaching experience.',
    profilePhoto: null,
  };

  const handleEditProfile = () => {
    navigation.navigate('EditStaffProfile', { staff });
  };

  const handleEditPhoto = () => {
    Alert.alert('Change Photo', 'This feature will allow you to change the profile picture.');
  };

  const handleFaceCapture = () => {
    navigation.navigate('FaceCaptureScreen', { staffId: staff.id });
  };

  const DetailItem = ({ icon, label, value }) => (
    <View style={styles.detailRow}>
      <Icon name={icon} size={18} color="#457B9D" style={styles.detailIcon} />
      <View>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatarContainer}>
          <Image
            source={
              staff.profilePhoto
                ? { uri: staff.profilePhoto }
                : require('../../assets/default-profile.jpg')
            }
            style={styles.avatar}
            resizeMode="cover"
          />
          <TouchableOpacity style={styles.editPhotoButton} onPress={handleEditPhoto}>
            <Icon name="camera" size={16} color="#1D3557" />
          </TouchableOpacity>
        </View>

        <Text style={styles.name}>{staff.name}</Text>
        <Text style={styles.role}>{staff.role}</Text>
        <Text style={styles.department}>{staff.department} Department</Text>

        <TouchableOpacity style={styles.editButton} onPress={handleEditProfile}>
          <Icon name="pen" size={14} color="#fff" />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>

        {/* New Face Capture Button */}
        <TouchableOpacity style={styles.faceCaptureButton} onPress={handleFaceCapture}>
          <Icon name="camera-retro" size={14} color="#fff" />
          <Text style={styles.faceCaptureButtonText}>Capture Face</Text>
        </TouchableOpacity>
      </View>

      {/* Personal Information */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Personal Information</Text>
        <DetailItem icon="id-card" label="Staff ID" value={staff.id} />
        <DetailItem icon="envelope" label="Email" value={staff.email} />
        <DetailItem icon="phone" label="Phone" value={staff.phone} />
        <DetailItem icon="calendar-alt" label="Join Date" value={staff.joinDate} />
        <DetailItem icon="building" label="Office" value={staff.office} />
      </View>

      {/* Qualifications */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Qualifications</Text>
        <Text style={styles.qualificationsText}>{staff.qualifications}</Text>
      </View>

      {/* About Section */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>About</Text>
        <Text style={styles.bioText}>{staff.bio}</Text>
      </View>

      {/* Emergency Contact */}
      <View style={styles.detailsSection}>
        <Text style={styles.sectionTitle}>Emergency Contact</Text>
        <DetailItem icon="user-shield" label="Contact Person" value="Michael Johnson (Spouse)" />
        <DetailItem icon="phone-alt" label="Emergency Number" value="+1 (555) 987-6543" />
      </View>
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
    right: 5,
    bottom: 5,
    backgroundColor: '#fff',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
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
  department: {
    fontSize: 16,
    color: '#A8DADC',
    marginBottom: 20,
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
    backgroundColor: '#E63946',
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 20,
    alignItems: 'center',
    elevation: 3,
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
  qualificationsText: {
    fontSize: 15,
    color: '#495057',
    lineHeight: 22,
  },
  bioText: {
    fontSize: 15,
    color: '#495057',
    lineHeight: 22,
  },
});

export default StaffProfileScreen;
