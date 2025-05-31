// Import necessary libraries
import { Platform } from 'react-native';
import crypto from 'crypto-js';

// Cloudinary configuration
const CLOUD_NAME = 'dt4gnmw2f';
const API_KEY = '943232363241585';
const API_SECRET = 'vy1K6o88QwQrpUDiqJPyo4Eebw4';
const UPLOAD_PRESET = 'facesimages';
const FOLDER_NAME = 'aditya-app-profiles';

const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
const CLOUDINARY_DELETE_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`;

// Helper function to generate SHA1 hash (works in both React Native and browser)
const generateSHA1 = (str) => {
  return crypto.SHA1(str).toString();
};

// Helper function to generate signature
const generateSignature = (publicId, timestamp) => {
  const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${API_SECRET}`;
  return generateSHA1(signatureStr);
};

// Improved function to extract public_id from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  if (!url || typeof url !== 'string') {
    console.error('[DEBUG] Invalid URL provided');
    return null;
  }

  try {
    // Match the pattern after /upload/ and before the file extension
    const matches = url.match(/upload\/(?:v\d+\/)?(.+?)(?:\..+)?$/);
    if (!matches || matches.length < 2) {
      console.error('[DEBUG] Could not extract public_id from URL:', url);
      return null;
    }
    
    const publicId = matches[1];
    console.log('[DEBUG] Extracted public_id:', publicId);
    return publicId;
  } catch (error) {
    console.error('[DEBUG] Error extracting public_id:', error);
    return null;
  }
};

// Function to delete image from Cloudinary with proper signature
export const deleteFromCloudinary = async (imageUrl) => {
  if (!imageUrl) {
    console.log('[DEBUG] No image URL provided for deletion');
    return false;
  }

  try {
    console.log('[DEBUG] Starting Cloudinary delete:', { imageUrl });
    
    const public_id = getPublicIdFromUrl(imageUrl);
    if (!public_id) {
      throw new Error('Could not extract public_id from URL');
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const signature = generateSignature(public_id, timestamp);

    // Create form data for deletion
    const formData = new FormData();
    formData.append('public_id', public_id);
    formData.append('api_key', API_KEY);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);

    console.log('[DEBUG] Delete request parameters:', {
      public_id,
      api_key: API_KEY,
      timestamp,
      signature,
      url: CLOUDINARY_DELETE_URL
    });

    const response = await fetch(CLOUDINARY_DELETE_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      },
    });

    const responseText = await response.text();
    console.log('[DEBUG] Raw delete response:', responseText);

    if (!response.ok) {
      console.error('[DEBUG] Cloudinary delete failed:', {
        status: response.status,
        statusText: response.statusText,
        response: responseText
      });
      return false;
    }

    const data = JSON.parse(responseText);
    console.log('[DEBUG] Cloudinary delete successful:', data);
    return data.result === 'ok';

  } catch (error) {
    console.error('[DEBUG] Error deleting from Cloudinary:', error);
    return false;
  }
};

// Improved upload function with better error handling
export const uploadToCloudinary = async (imageUri, oldImageUrl = null) => {
  try {
    // Optional: Delete old image if exists
    if (oldImageUrl) {
      try {
        const deleteSuccess = await deleteFromCloudinary(oldImageUrl);
        if (!deleteSuccess) {
          console.warn('[DEBUG] Failed to delete old image, continuing with upload');
        }
      } catch (deleteError) {
        console.warn('[DEBUG] Error deleting old image:', deleteError);
      }
    }

    console.log('[DEBUG] Starting Cloudinary upload:', {
      cloudName: CLOUD_NAME,
      preset: UPLOAD_PRESET,
      folder: FOLDER_NAME
    });

    // Create form data for upload
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : `image`;

    // For React Native, we need to handle the file URI differently
    const file = Platform.select({
      ios: {
        uri: imageUri,
        type,
        name: filename,
      },
      android: {
        uri: imageUri,
        type,
        name: filename,
      },
    });

    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', FOLDER_NAME);
    formData.append('tags', 'profile_photo');

    console.log('[DEBUG] Uploading to Cloudinary:', {
      filename,
      type,
      size: file.size || 'unknown'
    });

    // Upload to Cloudinary
    const response = await fetch(CLOUDINARY_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data',
      },
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('[DEBUG] Cloudinary upload failed:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData
      });
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('[DEBUG] Cloudinary upload successful:', {
      publicId: data.public_id,
      url: data.secure_url,
      size: data.bytes,
      format: data.format
    });

    if (!data.secure_url) {
      throw new Error('No secure_url in Cloudinary response');
    }

    return data.secure_url;

  } catch (error) {
    console.error('[DEBUG] Error in uploadToCloudinary:', {
      error: error.message,
      stack: error.stack,
      imageUri,
      oldImageUrl
    });
    throw new Error('Failed to upload image: ' + error.message);
  }
}; 