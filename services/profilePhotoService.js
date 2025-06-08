// services/profilePhotoService.js

import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { uploadProfilePhotoToCloudinary } from './api/uploadToCloudinary';
import { updateProfilePhotoUrl } from './Firebase/firestoreService';

const imageOptions = {
  mediaType: 'photo',
  quality: 0.8,
  maxWidth: 1024,
  maxHeight: 1024,
  includeBase64: false // We'll use URI instead of base64 for better performance
};

export const handleProfilePhotoUpload = async (email, callback) => {
  try {
    // Let user choose camera or gallery
    const result = await new Promise((resolve) => {
      Alert.alert(
        'Update Profile Photo',
        'Choose image source',
        [
          {
            text: 'Take Photo',
            onPress: async () => {
              const result = await launchCamera(imageOptions);
              resolve(result);
            }
          },
          {
            text: 'Choose from Gallery',
            onPress: async () => {
              const result = await launchImageLibrary(imageOptions);
              resolve(result);
            }
          },
          { 
            text: 'Cancel', 
            style: 'cancel',
            onPress: () => resolve(null)
          }
        ]
      );
    });

    if (!result || result.didCancel) return;

    if (result.errorCode) {
      throw new Error(result.errorMessage || 'Image selection failed');
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) throw new Error('No image selected');

    // Upload to Cloudinary
    const photoUrl = await uploadProfilePhotoToCloudinary(asset.uri);
    
    // Save to Firestore
    await updateProfilePhotoUrl(email, photoUrl);
    
    // Update local state if callback provided
    if (callback) callback(photoUrl);
    
    return photoUrl;
  } catch (error) {
    console.error('Profile photo upload error:', error);
    throw error;
  }
};