// services/api/uploadToCloudinary.js

const CLOUDINARY_CONFIG = {
  cloudName: 'dt4gnmw2f', // Your Cloudinary cloud name
  uploadPresetOptions: [
    'facesimages', // Your custom upload preset
    'ml_default'   // Cloudinary default preset
  ],
  apiBaseUrl: 'https://api.cloudinary.com/v1_1',
  maxRetries: 3,    // Maximum number of retry attempts
  retryDelay: 1000, // Delay between retries in ms
  timeout: 15000    // Request timeout in ms
};

/**
 * Uploads an image to Cloudinary with retry logic
 * @param {string} imageDataUri - URI of the image to upload
 * @param {object} options - Optional parameters
 * @param {string} options.folder - Target folder in Cloudinary
 * @param {string} options.preset - Specific upload preset to use
 * @returns {Promise<string>} - Secure URL of the uploaded image
 */
export const uploadToCloudinary = async (imageDataUri, options = {}) => {
  if (!imageDataUri) {
    throw new Error('No image data provided');
  }

  let lastError = null;
  const folder = options.folder || 'face_uploads';
  const forcedPreset = options.preset;
  
  // Try each preset in sequence
  for (const uploadPreset of forcedPreset 
    ? [forcedPreset] 
    : CLOUDINARY_CONFIG.uploadPresetOptions) {
    
    for (let attempt = 1; attempt <= CLOUDINARY_CONFIG.maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt} with preset ${uploadPreset}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(), 
          CLOUDINARY_CONFIG.timeout
        );

        const { cloudName, apiBaseUrl } = CLOUDINARY_CONFIG;
        const apiUrl = `${apiBaseUrl}/${cloudName}/upload`;

        const formData = new FormData();
        formData.append('file', {
          uri: imageDataUri,
          type: 'image/jpeg',
          name: `upload_${Date.now()}_${attempt}.jpg`
        });
        formData.append('upload_preset', uploadPreset);
        formData.append('folder', folder);

        const response = await fetch(apiUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const data = await response.json();

        if (!response.ok) {
          lastError = data.error?.message || `HTTP ${response.status}`;
          if (attempt < CLOUDINARY_CONFIG.maxRetries) {
            await new Promise(res => setTimeout(res, CLOUDINARY_CONFIG.retryDelay));
            continue;
          }
          break;
        }

        console.log('Upload successful:', data.secure_url);
        return data.secure_url;
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error.message;
        console.error(`Attempt ${attempt} failed:`, error);
        
        if (attempt < CLOUDINARY_CONFIG.maxRetries) {
          await new Promise(res => setTimeout(res, CLOUDINARY_CONFIG.retryDelay));
        }
      }
    }
  }

  throw new Error(`All upload attempts failed. Last error: ${lastError}`);
};

/**
 * Uploads a profile photo to Cloudinary
 * @param {string} imageUri - URI of the profile photo
 * @returns {Promise<string>} - Secure URL of the uploaded image
 */
export const uploadProfilePhotoToCloudinary = async (imageUri) => {
  try {
    return await uploadToCloudinary(imageUri, {
      folder: 'profile_photos',
      preset: 'facesimages' // Force profile preset
    });
  } catch (error) {
    console.error('Profile photo upload failed:', error);
    throw new Error(`Profile upload failed: ${error.message}`);
  }
};