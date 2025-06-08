import React, { createContext, useContext, useState, useEffect } from 'react';
import { getAuthState } from '../services/Firebase/authUtils';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const persistedUser = await getAuthState();
        if (persistedUser) {
          setUser(persistedUser);
        }
      } catch (error) {
        console.error('Error initializing user:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeUser();
  }, []);

  const updateUser = (userData) => {
    console.log('[DEBUG] Updating user:', userData?.role);
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