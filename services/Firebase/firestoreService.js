import { doc, setDoc, getDoc, serverTimestamp, arrayUnion, collection, updateDoc, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';
import firebase from 'firebase/compat/app';

export const saveUser = async (email, name, id, phoneNumber, role, department = null) => {
  try {
    const emailLower = email.toLowerCase().trim(); // convert to lowercase and trim
    await setDoc(doc(db, 'users', emailLower), {
      email: emailLower, // Store email in lowercase
      name: name.trim(),
      id: (id || '').trim(), // Store ID (can be staff, student, or admin ID)
      phoneNumber: phoneNumber.trim(),
      role, // Add role to the user document
      department: department ? department.trim() : null, // Add department to the user document
      createdAt: new Date().toISOString(),
      isVerified: false // Will be set to true when email is verified
    });
    console.log('User data saved!');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
};

export const fetchUser = async (email) => {
  try {
    // Convert email to lowercase and trim for consistency
    const lowerEmail = email.toLowerCase().trim();
    const userDoc = await getDoc(doc(db, 'users', lowerEmail));
    
    if (userDoc.exists()) {
      return { id: userDoc.id, ...userDoc.data() };
    } else {
      console.log('No user document found for:', lowerEmail);
      return null;
    }
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
    
    // For staff and faculty emails
    if (role === 'staff' || role === 'faculty') {
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

export const saveLocationRecord = async (email, role, locationData) => {
  try {
    if (!email || !locationData) {
      console.error('Missing required data:', { email, locationData });
      throw new Error('Missing required data for location saving');
    }

    const emailLower = email.toLowerCase();
    const now = new Date();
    
    // Reference directly to the user's email document in location collection
    const locationRef = db.collection('location').doc(emailLower);

    // Get the previous document to calculate time difference
    const doc = await locationRef.get();
    let timeDiffInSeconds = 0;
    
    if (doc.exists) {
      const lastUpdate = doc.data().lastUpdate ? new Date(doc.data().lastUpdate) : now;
      timeDiffInSeconds = Math.round((now - lastUpdate) / 1000);
    }

    // Update the document with new values
    await locationRef.set({
      altitude: locationData.altitude || 0,
      longitude: locationData.longitude,
      latitude: locationData.latitude,
      lastUpdate: now.toISOString(),
      updateInterval: timeDiffInSeconds // Time difference in seconds since last update
    });

    console.log('Location data saved successfully');
    return true;
  } catch (error) {
    console.error('Detailed error saving location data:', error);
    throw error;
  }
};

export const updateUserLastLogin = async (email) => {
  try {
    // Convert email to lowercase and trim for consistency
    const lowerEmail = email.toLowerCase().trim();
    const userRef = doc(db, 'users', lowerEmail);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Update existing document
      await updateDoc(userRef, {
        lastLogin: serverTimestamp()
      });
    } else {
      // Create new document if it doesn't exist
      await setDoc(userRef, {
        email: lowerEmail,
        lastLogin: serverTimestamp(),
        createdAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error updating user last login:', error);
    throw error;
  }
};

export const createOrUpdateUser = async (userData) => {
  try {
    // Convert email to lowercase for consistency
    const lowerEmail = userData.email.toLowerCase();
    const userRef = doc(db, 'users', lowerEmail);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Update existing document
      await updateDoc(userRef, {
        ...userData,
        email: lowerEmail,
        updatedAt: serverTimestamp()
      });
    } else {
      // Create new document
      await setDoc(userRef, {
        ...userData,
        email: lowerEmail,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Error creating/updating user:', error);
    throw error;
  }
};

// Function to fetch today's attendance record
export const fetchTodayAttendance = async (email) => {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const formattedEmail = email.toLowerCase().replace(/\./g, '_');
    const today = new Date();
    const year = today.getFullYear().toString();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[today.getMonth()];
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

    console.log('[DEBUG] Fetching attendance for:', { email, dateStr, monthName, year });

    // Get attendance reference from realtime database
    const attendanceRef = firebase.database()
      .ref(`user_attendance/${formattedEmail}/${year}/${monthName}/records`);

    // Get attendance snapshot
    const snapshot = await attendanceRef.once('value');
    const records = snapshot.val();

    if (!records) {
      console.log('[DEBUG] No attendance records found');
      return null;
    }

    // Find today's record
    const todayRecord = Object.values(records).find(record => {
      const recordDate = new Date(record.timestamp.seconds * 1000);
      const recordDateStr = `${recordDate.getMonth() + 1}/${recordDate.getDate()}/${recordDate.getFullYear()}`;
      return recordDateStr === dateStr;
    });

    if (todayRecord) {
      console.log('[DEBUG] Found today\'s attendance:', todayRecord);
      return todayRecord;
    }

    console.log('[DEBUG] No attendance record found for today');
    return null;
  } catch (error) {
    console.error('Error fetching today\'s attendance:', error);
    throw error;
  }
};

// Function to fetch monthly attendance records
export const fetchMonthlyAttendance = async (email, year, month) => {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const formattedEmail = email.toLowerCase().replace(/\./g, '_');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[month - 1];

    console.log('[DEBUG] Fetching monthly attendance for:', { email, year, monthName });

    // Get attendance reference from realtime database
    const attendanceRef = firebase.database()
      .ref(`user_attendance/${formattedEmail}/${year}/${monthName}/records`);

    // Get attendance snapshot
    const snapshot = await attendanceRef.once('value');
    const records = snapshot.val();

    if (!records) {
      console.log('[DEBUG] No monthly records found');
      return {
        records: [],
        summary: {
          present: 0,
          absent: 0,
          late: 0,
          total: 0,
          percentage: 0
        }
      };
    }

    // Convert records object to array and sort by date
    const recordsArray = Object.values(records).sort((a, b) => {
      const dateA = new Date(a.timestamp.seconds * 1000);
      const dateB = new Date(b.timestamp.seconds * 1000);
      return dateA - dateB;
    });

    // Calculate summary
    const summary = recordsArray.reduce((acc, record) => {
      if (record.status === 'Present') acc.present++;
      if (record.status === 'Absent') acc.absent++;
      if (record.isLate) acc.late++;
      acc.total++;
      return acc;
    }, { present: 0, absent: 0, late: 0, total: 0 });

    summary.percentage = summary.total > 0 
      ? ((summary.present / summary.total) * 100).toFixed(2)
      : 0;

    console.log('[DEBUG] Monthly attendance summary:', summary);

    return {
      records: recordsArray,
      summary
    };
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    throw error;
  }
};

// Function to fetch attendance statistics
export const fetchAttendanceStats = async (email) => {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const formattedEmail = email.toLowerCase().replace(/\./g, '_');
    const today = new Date();
    const year = today.getFullYear().toString();
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = months[today.getMonth()];

    console.log('[DEBUG] Fetching attendance stats for:', { email, year, monthName });

    // Get attendance reference from realtime database
    const attendanceRef = firebase.database()
      .ref(`user_attendance/${formattedEmail}/${year}/${monthName}/records`);

    // Get attendance snapshot
    const snapshot = await attendanceRef.once('value');
    const records = snapshot.val();

    if (!records) {
      console.log('[DEBUG] No records found for statistics');
      return {
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0,
        percentage: 0,
        streak: 0
      };
    }

    // Convert records to array
    const recordsArray = Object.values(records);

    // Calculate statistics
    const stats = recordsArray.reduce((acc, record) => {
      acc.totalDays++;
      if (record.status === 'Present') acc.presentDays++;
      if (record.status === 'Absent') acc.absentDays++;
      if (record.isLate) acc.lateDays++;
      return acc;
    }, { totalDays: 0, presentDays: 0, absentDays: 0, lateDays: 0 });

    // Calculate attendance percentage
    stats.percentage = stats.totalDays > 0 
      ? ((stats.presentDays / stats.totalDays) * 100).toFixed(2)
      : 0;

    // Calculate current streak
    let streak = 0;
    const sortedRecords = recordsArray.sort((a, b) => {
      const dateA = new Date(a.timestamp.seconds * 1000);
      const dateB = new Date(b.timestamp.seconds * 1000);
      return dateB - dateA; // Sort in descending order (most recent first)
    });

    for (const record of sortedRecords) {
      if (record.status === 'Present') {
        streak++;
      } else {
        break;
      }
    }
    stats.streak = streak;

    console.log('[DEBUG] Attendance statistics:', stats);
    return stats;
  } catch (error) {
    console.error('Error fetching attendance statistics:', error);
    throw error;
  }
};

// Function to fetch departments
export const fetchDepartments = async () => {
  try {
    const departmentsRef = collection(db, 'Departments');
    const departmentsSnapshot = await getDocs(departmentsRef);

    // If only one document, and fields are numbers
    if (departmentsSnapshot.size === 1) {
      const doc = departmentsSnapshot.docs[0];
      const data = doc.data();
      // Get all field values as department names
      return Object.values(data).map((name, idx) => ({
        id: idx.toString(),
        name,
      }));
    }

    // Otherwise, treat each document as a department
    const departments = [];
    departmentsSnapshot.forEach(doc => {
      departments.push({
        id: doc.id,
        ...doc.data()
      });
    });
    return departments;
  } catch (error) {
    console.error('Error fetching departments:', error);
    throw error;
  }
};

export const fetchRoleSpecificDepartments = async (role) => {
  try {
    let docId;
    switch (role) {
      case 'faculty':
        docId = 'faculty';
        break;
      case 'staff':
        docId = 'staff';
        break;
      case 'admin':
        docId = 'admin';
        break;
      default:
        throw new Error('Invalid role specified');
    }

    console.log('[DEBUG] Fetching departments for role:', role);
    
    // Get the document reference using firebase.firestore()
    const docRef = firebase.firestore().collection('Departments').doc(docId);
    console.log('[DEBUG] Attempting to fetch document:', docId);
    
    const departmentDoc = await docRef.get();
    console.log('[DEBUG] Document exists?', departmentDoc.exists);
    
    if (departmentDoc.exists) {
      const data = departmentDoc.data();
      console.log('[DEBUG] Document data:', data);
      
      // For admin roles, we expect numeric string keys (0-9)
      if (role === 'admin') {
        const adminRoles = Object.entries(data)
          .map(([key, value]) => ({
            id: key,
            name: value
          }))
          .sort((a, b) => parseInt(a.id) - parseInt(b.id));
          
        console.log('[DEBUG] Processed admin roles:', adminRoles);
        return adminRoles;
      }

      // For faculty and staff, handle as before
      const departments = Object.entries(data).map(([id, name]) => ({
        id,
        name: name.toString()
      }));
      
      console.log('[DEBUG] Processed departments:', departments);
      return departments;
    }

    console.log(`[DEBUG] No departments/roles found for: ${role}`);
    return [];
  } catch (error) {
    console.error('[DEBUG] Error fetching departments/roles:', error);
    throw error;
  }
};

// Function to initialize admin roles
export const initializeAdminRoles = async () => {
  try {
    const adminRoles = {
      "0": "Vice Chancellor",
      "1": "Registrar",
      "2": "Dean of Academics",
      "3": "Controller of Examinations",
      "4": "Director of Research",
      "5": "Finance Officer",
      "6": "HR Manager",
      "7": "Super Admin",
      "8": "System Admin",
      "9": "Department Admin(Operator)"
    };

    await setDoc(doc(db, 'Departments', 'admin'), adminRoles);
    console.log('Admin roles initialized successfully');
    return true;
  } catch (error) {
    console.error('Error initializing admin roles:', error);
    throw error;
  }
};

export const updatePushToken = async (email, token) => {
  try {
    if (!email || !token) {
      console.log('Email and token are required for push token update');
      return;
    }

    const lowerEmail = email.toLowerCase().trim();
    const userRef = doc(db, 'users', lowerEmail);
    
    // First check if user exists
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      // Create user document if it doesn't exist
      await setDoc(userRef, {
        email: lowerEmail,
        pushToken: token,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
    } else {
      // Update existing document
      await updateDoc(userRef, {
        pushToken: token,
        lastUpdated: serverTimestamp()
      });
    }
    
    console.log('Push token updated successfully');
    return true;
  } catch (error) {
    console.error('Error updating push token:', error);
    // Don't throw the error, just log it
    return false;
  }
};