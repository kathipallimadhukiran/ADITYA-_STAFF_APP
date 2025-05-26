import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebaseConfig';

export const saveUser = async (email, name, staffId, phoneNumber) => {
  try {
    await setDoc(doc(db, 'users', email), {
      email,
      name,
      staffId: staffId || null, // Store null if empty
      phoneNumber,
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
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data();
    }
    return null;
  } catch (error) {
    console.error('Error fetching user:', error);
    throw error;
  }
};