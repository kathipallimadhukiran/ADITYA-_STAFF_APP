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
      const [userData, isLoggedIn, emailCredential, passwordCredential] = await Promise.all([
        AsyncStorage.getItem('@user_data'),
        AsyncStorage.getItem('@is_logged_in'),
        AsyncStorage.getItem('@user_email'),
        AsyncStorage.getItem('@user_password')
      ]);

      if (userData && isLoggedIn === 'true') {
        const parsedUserData = JSON.parse(userData);
        console.log('[DEBUG] Found stored user data:', parsedUserData.email);
        return {
          userData: parsedUserData,
          credentials: emailCredential && passwordCredential ? {
            email: emailCredential,
            password: passwordCredential
          } : null
        };
      }
      return { userData: null, credentials: null };
    } catch (error) {
      console.error('[DEBUG] Error restoring session:', error);
      return { userData: null, credentials: null };
    }
  };

  const initializeUser = async () => {
    try {
      console.log('[DEBUG] UserContext: Starting user initialization');
      setIsLoading(true);

      // First try to get the current Firebase user
      const currentUser = firebase.auth().currentUser;
      
      // Then try to restore the session from storage
      const { userData: storedUser, credentials } = await restoreSession();

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
      } else if (storedUser && credentials && retryCount < MAX_RETRIES) {
        // If no Firebase session but we have stored user data and credentials, try to restore
        console.log('[DEBUG] UserContext: Attempting to restore session with stored credentials');
        try {
          const userCredential = await firebase.auth().signInWithEmailAndPassword(
            credentials.email,
            credentials.password
          );
          
          if (userCredential.user.emailVerified) {
            setUser(storedUser);
          } else {
            throw new Error('Email not verified');
          }
        } catch (error) {
          console.log('[DEBUG] UserContext: Failed to restore session:', error.message);
          if (retryCount < MAX_RETRIES - 1) {
            setRetryCount(prev => prev + 1);
            setTimeout(initializeUser, 1000); // Retry after 1 second
          } else {
            console.log('[DEBUG] UserContext: Max retries reached, clearing state');
            await clearAuthState();
            setUser(null);
          }
        }
      } else {
        console.log('[DEBUG] UserContext: No valid session to restore');
        await clearAuthState();
        setUser(null);
      }
    } catch (error) {
      console.error('[DEBUG] UserContext: Error initializing user:', error);
      await clearAuthState();
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
        if (firebaseUser.emailVerified) {
          initializeUser();
        } else {
          console.log('[DEBUG] Firebase user email not verified');
          await clearAuthState();
          setUser(null);
        }
      } else {
        console.log('[DEBUG] Firebase auth state: signed out');
        await clearAuthState();
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