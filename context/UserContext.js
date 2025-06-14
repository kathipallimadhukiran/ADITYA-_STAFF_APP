import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuthState, clearAuthState } from '../services/Firebase/authUtils';
import { firebase } from '../services/Firebase/firebaseConfig';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeUser = async () => {
      try {
        console.log('[DEBUG] UserContext: Starting user initialization');
        const persistedUser = await getAuthState();
        
        if (persistedUser) {
          console.log('[DEBUG] UserContext: Found persisted user:', persistedUser.email);
          
          // Verify Firebase session
          const currentUser = firebase.auth().currentUser;
          if (currentUser && currentUser.email === persistedUser.email) {
            console.log('[DEBUG] UserContext: Firebase session verified');
            setUser(persistedUser);
          } else {
            console.log('[DEBUG] UserContext: Firebase session mismatch, clearing state');
            await clearAuthState();
            setUser(null);
          }
        } else {
          console.log('[DEBUG] UserContext: No persisted user found');
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

    initializeUser();
  }, []);

  const updateUser = (userData) => {
    console.log('[DEBUG] UserContext: Updating user:', userData?.email);
    setUser(userData);
  };

  return (
    <UserContext.Provider value={{ user, setUser: updateUser, isLoading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}; 