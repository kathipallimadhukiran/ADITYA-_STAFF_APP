import { doc, setDoc, getDoc,serverTimestamp  } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const saveUser = async (email, name, id, phoneNumber, role) => {
  try {
     const emailLower = email.toLowerCase(); // convert to lowercase
    await setDoc(doc(db, 'users', emailLower), {
      email: emailLower, // Store email in lowercase
      name,
      id: id || null, // Store ID (can be staff, student, or admin ID)
      phoneNumber,
      role, // Add role to the user document
      createdAt: new Date().toISOString(),
    });
    console.log('User data saved!');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
};

export const fetchUser = async (email) => {
  try {
    const userRef = doc(db, 'users', email);
    console.log('Fetching user from:', userRef.path);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      console.log('User data found:', userSnap.data());
      return userSnap.data();
    }
    console.log('No user document found for:', email);
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
};

export const validateAdminCode = (code) => {
  return code === 'madhu';
};

export const isEmailAuthorized = async (email, role) => {
  try {
    const emailLower = email.toLowerCase();
    
    // For staff emails
    if (role === 'staff') {
      const validDomains = ['@aec.edu.in', '@gmail.com'];
      return validDomains.some(domain => emailLower.endsWith(domain.toLowerCase()));
    }
    
    // For student emails
    if (role === 'student') {
      return emailLower.endsWith('@aec.edu.in');
    }
    
    // For admin emails
    if (role === 'admin') {
      return emailLower.endsWith('@gmail.com') || emailLower.endsWith('@aec.edu.in');
    }
    
    // If role is not recognized
    return false;
  } catch (error) {
    console.error('Error checking email authorization:', error);
    return false;
  }
};

export const saveImageUrlToStaffFaces = async (userId, imageUrls) => {
  if (!userId) {
    throw new Error('User ID is required');
  }

  if (!Array.isArray(imageUrls)) {
    imageUrls = [imageUrls]; // Handle single URL case
  }

  try {
    const staffFaceRef = doc(db, 'staffFaces', userId);
    const docSnap = await getDoc(staffFaceRef);

    let existingImages = [];
    if (docSnap.exists()) {
      existingImages = docSnap.data().faceImages || [];
    }

    // Combine and limit to last 10 images
    const updatedImages = [...existingImages, ...imageUrls].slice(-10);

    await setDoc(
      staffFaceRef,
      {
        userId, // Changed from staffId to userId for consistency
        faceImages: updatedImages,
        lastUpdated: serverTimestamp(),
      },
      { merge: true }
    );

    console.log(`Saved ${imageUrls.length} images for user ${userId}`);
    return true;
  } catch (error) {
    console.error('Save error:', error);
    throw new Error('Failed to save images to database');
  }
};

// services/Firebase/firestoreService.js

// Add this function to update profile photo URL
export const updateProfilePhotoUrl = async (email, photoUrl) => {
  try {
    const userRef = doc(db, 'users', email.toLowerCase());
    await setDoc(
      userRef,
      {
        profilePhoto: photoUrl,
        lastUpdated: serverTimestamp()
      },
      { merge: true }
    );
    console.log('Profile photo URL updated in Firestore');
    return true;
  } catch (error) {
    console.error('Error updating profile photo URL:', error);
    throw error;
  }
};

// Add this function to update user role
export const updateUserRole = async (email, role) => {
  try {
    const userRef = doc(db, 'users', email.toLowerCase());
    await setDoc(
      userRef,
      {
        role,
        lastUpdated: serverTimestamp()
      },
      { merge: true }
    );
    console.log('User role updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating user role:', error);
    throw error;
  }
};