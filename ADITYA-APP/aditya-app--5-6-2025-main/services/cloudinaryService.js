// Import necessary libraries
import { Platform } from 'react-native';
import crypto from 'crypto-js';
import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from '../config/cloudinaryConfig';

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
export const uploadToCloudinary = async (imageUri) => {
  try {
    // Create form data
    const formData = new FormData();
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image';

    formData.append('file', {
      uri: imageUri,
      name: filename,
      type,
    });
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    // Upload to Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
      {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    const data = await response.json();

    if (response.ok) {
      return data.secure_url;
    } else {
      throw new Error(data.message || 'Failed to upload image');
    }
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw error;
  }
}; 