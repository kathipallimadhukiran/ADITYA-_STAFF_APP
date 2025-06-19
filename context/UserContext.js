import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuthState, clearAuthState } from '../services/Firebase/authUtils';
import { firebase } from '../services/Firebase/firebaseConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

export const UserContext = createContext();

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const MAX_RETRIES = 3;

  const restoreSession = async () => {
    try {
      const [userData, isLoggedIn] = await Promise.all([
        AsyncStorage.getItem('@user_data'),
        AsyncStorage.getItem('@is_logged_in')
      ]);

      if (userData && isLoggedIn === 'true') {
        const parsedUserData = JSON.parse(userData);
        console.log('[DEBUG] Found stored user data:', parsedUserData.email);
        return parsedUserData;
      }
      return null;
    } catch (error) {
      console.error('[DEBUG] Error restoring session:', error);
      return null;
    }
  };

  const initializeUser = async () => {
    try {
      console.log('[DEBUG] UserContext: Starting user initialization');
      setIsLoading(true);

      // First try to get the current Firebase user
      const currentUser = firebase.auth().currentUser;
      
      // Then try to restore the session from storage
      const storedUser = await restoreSession();

      if (currentUser) {
        // If Firebase session exists, verify against stored data
        if (storedUser && storedUser.email === currentUser.email) {
          console.log('[DEBUG] UserContext: Firebase session matches stored data');
          setUser(storedUser);
        } else {
          // If stored data doesn't match, fetch fresh user data
          console.log('[DEBUG] UserContext: Fetching fresh user data');
          const userDoc = await firebase.firestore()
            .collection('users')
            .doc(currentUser.email)
            .get();

          if (userDoc.exists) {
            const freshUserData = {
              ...userDoc.data(),
              email: currentUser.email,
              uid: currentUser.uid,
              emailVerified: currentUser.emailVerified
            };
            await AsyncStorage.setItem('@user_data', JSON.stringify(freshUserData));
            await AsyncStorage.setItem('@is_logged_in', 'true');
            setUser(freshUserData);
          }
        }
      } else if (storedUser && retryCount < MAX_RETRIES) {
        // If no Firebase session but we have stored user data, try to restore
        console.log('[DEBUG] UserContext: Attempting to restore session');
        try {
          const emailCredential = await AsyncStorage.getItem('@user_email');
          const passwordCredential = await AsyncStorage.getItem('@user_password');
          
          if (emailCredential && passwordCredential) {
            await firebase.auth().signInWithEmailAndPassword(emailCredential, passwordCredential);
            setUser(storedUser);
          } else {
            throw new Error('No stored credentials');
          }
        } catch (error) {
          console.log('[DEBUG] UserContext: Failed to restore session, retrying...');
          setRetryCount(prev => prev + 1);
          setTimeout(initializeUser, 1000); // Retry after 1 second
        }
      } else if (retryCount >= MAX_RETRIES) {
        console.log('[DEBUG] UserContext: Max retries reached, clearing state');
        await clearAuthState();
        setUser(null);
      } else {
        console.log('[DEBUG] UserContext: No user data found');
        setUser(null);
      }
    } catch (error) {
      console.error('[DEBUG] UserContext: Error initializing user:', error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    initializeUser();

    // Set up auth state listener
    const unsubscribe = firebase.auth().onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        console.log('[DEBUG] Firebase auth state changed:', firebaseUser.email);
        initializeUser();
      } else {
        console.log('[DEBUG] Firebase auth state: signed out');
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, []);

  const updateUser = (userData) => {
    console.log('[DEBUG] UserContext: Updating user:', userData?.email);
    if (userData) {
      AsyncStorage.setItem('@user_data', JSON.stringify(userData))
        .then(() => AsyncStorage.setItem('@is_logged_in', 'true'))
        .then(() => setUser(userData))
        .catch(error => console.error('[DEBUG] Error saving user data:', error));
    } else {
      setUser(null);
    }
  };

  return (
    <UserContext.Provider value={{ user, setUser: updateUser, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}; 