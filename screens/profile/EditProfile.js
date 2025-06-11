import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { useNavigation, useRoute } from '@react-navigation/native';
import { db } from '../../services/Firebase/firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import { uploadToCloudinary } from '../../services/api/uploadToCloudinary ';
const EditProfile = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const userData = route.params?.userData;
  const [loading, setLoading] = useState(false);
  const [profileImage, setProfileImage] = useState(userData?.profilePhoto || null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const [formData, setFormData] = useState({
    name: userData?.name || '',
    phoneNumber: userData?.phoneNumber || '',
    bio: userData?.bio || '',
    department: userData?.department || '',
    qualifications: userData?.qualifications || '',
    course: userData?.course || '',
    year: userData?.year || '',
    emergencyContact: {
      name: userData?.emergencyContact?.name || '',
      phone: userData?.emergencyContact?.phone || '',
    },
  });

  const saveProfilePhoto = async (photoUrl) => {
    try {
      const userRef = doc(db, 'users', userData.email);
      await updateDoc(userRef, {
        profilePhoto: photoUrl,
        updatedAt: new Date().toISOString(),
      });
      // Don't show an alert here since it's automatic
      console.log('Profile photo updated successfully');
    } catch (error) {
      console.error('Error updating profile photo:', error);
      Alert.alert('Error', 'Failed to update profile photo');
    }
  };

  const handleImagePick = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setIsUploadingImage(true);
        try {
          console.log('Starting upload to Cloudinary:', result.assets[0].uri);
          const uploadedUrl = await uploadToCloudinary(result.assets[0].uri, {
            folder: 'profile_photos',
            preset: 'facesimages'
          });
          console.log('Upload successful, URL:', uploadedUrl);
          
          if (uploadedUrl) {
            setProfileImage(uploadedUrl);
            await saveProfilePhoto(uploadedUrl);
            console.log('Profile photo saved to Firestore');
          } else {
            throw new Error('No URL returned from upload');
          }
        } catch (error) {
          console.error('Upload error:', error);
          Alert.alert('Error', 'Failed to upload image: ' + error.message);
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Image picker error:', error);
      Alert.alert('Error', 'Failed to pick image: ' + error.message);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission required', 'Camera permission is required.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setIsUploadingImage(true);
        try {
          console.log('Starting upload to Cloudinary:', result.assets[0].uri);
          const uploadedUrl = await uploadToCloudinary(result.assets[0].uri, {
            folder: 'profile_photos',
            preset: 'facesimages'
          });
          console.log('Upload successful, URL:', uploadedUrl);
          
          if (uploadedUrl) {
            setProfileImage(uploadedUrl);
            await saveProfilePhoto(uploadedUrl);
            console.log('Profile photo saved to Firestore');
          } else {
            throw new Error('No URL returned from upload');
          }
        } catch (error) {
          console.error('Upload error:', error);
          Alert.alert('Error', 'Failed to upload image: ' + error.message);
        } finally {
          setIsUploadingImage(false);
        }
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to take photo: ' + error.message);
    }
  };

  const handleImageUpdate = () => {
    Alert.alert(
      'Update Profile Photo',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: handleTakePhoto,
        },
        {
          text: 'Choose from Gallery',
          onPress: handleImagePick,
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
      { cancelable: true }
    );
  };

  const handleDeletePhoto = async () => {
    try {
      const userRef = doc(db, 'users', userData.email);
      await updateDoc(userRef, { profilePhoto: null });
      setProfileImage(null);
      Alert.alert('Success', 'Profile photo removed.');
    } catch (error) {
      Alert.alert('Error', 'Failed to remove profile photo.');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Name is required');
      return;
    }

    if (!formData.phoneNumber.trim()) {
      Alert.alert('Error', 'Phone number is required');
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', userData.email);
      await updateDoc(userRef, {
        name: formData.name,
        phoneNumber: formData.phoneNumber,
        bio: formData.bio,
        ...(userData.role === 'staff' && {
          department: formData.department,
          qualifications: formData.qualifications,
        }),
        ...(userData.role === 'student' && {
          course: formData.course,
          year: formData.year,
        }),
        emergencyContact: {
          name: formData.emergencyContact.name,
          phone: formData.emergencyContact.phone,
        },
        updatedAt: new Date().toISOString(),
      });

      Alert.alert('Success', 'Profile updated successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert('Error', 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const renderRoleSpecificFields = () => {
    switch (userData?.role) {
      case 'staff':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Department</Text>
              <TextInput
                style={styles.input}
                value={formData.department}
                onChangeText={(text) => setFormData(prev => ({ ...prev, department: text }))}
                placeholder="Enter department"
                placeholderTextColor="#a1a1aa"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Qualifications</Text>
              <TextInput
                style={styles.input}
                value={formData.qualifications}
                onChangeText={(text) => setFormData(prev => ({ ...prev, qualifications: text }))}
                placeholder="Enter qualifications"
                placeholderTextColor="#a1a1aa"
              />
            </View>
          </>
        );
      case 'student':
        return (
          <>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Course</Text>
              <TextInput
                style={styles.input}
                value={formData.course}
                onChangeText={(text) => setFormData(prev => ({ ...prev, course: text }))}
                placeholder="Enter course"
                placeholderTextColor="#a1a1aa"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Year</Text>
              <TextInput
                style={styles.input}
                value={formData.year}
                onChangeText={(text) => setFormData(prev => ({ ...prev, year: text }))}
                placeholder="Enter year"
                keyboardType="numeric"
                placeholderTextColor="#a1a1aa"
              />
            </View>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-left" size={20} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
        </View>

        <View style={styles.imageSection}>
          <View style={styles.imageContainer}>
            <Image
              source={
                profileImage
                  ? { uri: profileImage }
                  : require('../../assets/default-profile.jpg')
              }
              style={styles.profileImage}
            />
            {isUploadingImage && (
              <View style={styles.uploadingOverlay}>
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.changePhotoButton}
            onPress={handleImageUpdate}
            disabled={isUploadingImage}
          >
            <Icon name="camera" size={16} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.changePhotoText}>
              {isUploadingImage ? 'Uploading...' : 'Change Photo'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={formData.name}
              onChangeText={text => setFormData(prev => ({ ...prev, name: text }))}
              placeholder="Enter name"
              placeholderTextColor="#a1a1aa"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput
              style={styles.input}
              value={formData.phoneNumber}
              onChangeText={text => setFormData(prev => ({ ...prev, phoneNumber: text }))}
              placeholder="Enter phone number"
              keyboardType="phone-pad"
              placeholderTextColor="#a1a1aa"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Bio</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.bio}
              onChangeText={text => setFormData(prev => ({ ...prev, bio: text }))}
              placeholder="Write something about yourself"
              multiline
              numberOfLines={4}
              placeholderTextColor="#a1a1aa"
            />
          </View>

          {renderRoleSpecificFields()}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Emergency Contact</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contact Name</Text>
              <TextInput
                style={styles.input}
                value={formData.emergencyContact.name}
                onChangeText={text => setFormData(prev => ({
                  ...prev,
                  emergencyContact: { ...prev.emergencyContact, name: text }
                }))}
                placeholder="Enter emergency contact name"
                placeholderTextColor="#a1a1aa"
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Contact Phone</Text>
              <TextInput
                style={styles.input}
                value={formData.emergencyContact.phone}
                onChangeText={(text) => setFormData(prev => ({
                  ...prev,
                  emergencyContact: { ...prev.emergencyContact, phone: text }
                }))}
                placeholder="Enter emergency contact phone"
                keyboardType="phone-pad"
                placeholderTextColor="#a1a1aa"
              />
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.saveButton,
            (loading || isUploadingImage) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={loading || isUploadingImage}
        >
          {loading ? (
            <Text style={styles.saveButtonText}>Saving...</Text>
          ) : (
            <>
              <Icon name="save" size={16} color="#fff" />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    backgroundColor: '#1D3557',
    padding: 20,
    paddingTop: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 15,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#457B9D',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
  color: '#000',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  section: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 15,
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  saveButton: {
    backgroundColor: '#2EC4B6',
    borderRadius: 8,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  imageSection: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  imageContainer: {
    position: 'relative',
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#f0f0f0',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  changePhotoButton: {
    flexDirection: 'row',
    backgroundColor: '#457B9D',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 8,
  },
  changePhotoText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default EditProfile; 
