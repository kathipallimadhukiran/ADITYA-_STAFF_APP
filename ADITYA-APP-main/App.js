import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View, Text, LogBox } from 'react-native';
import AppNavigator from './navigation/AppNavigator';
import { firebase } from './services/firebaseConfig';
import { getAuthState, clearAuthState, setAuthState, isFirstInstall } from './services/authUtils';

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
]);

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [showLogin, setShowLogin] = useState(false);

useEffect(() => {
  let unsubscribeFromAuth = null;

  const checkAuthState = async () => {
    try {
      const firstInstall = await isFirstInstall();
      const persistedUser = await getAuthState();
      
      if (firstInstall) {
        setShowLogin(true);
        setInitializing(false);
        return;
      }

      // Set up Firebase auth listener
      unsubscribeFromAuth = firebase.auth().onAuthStateChanged(async (user) => {
        if (user && user.emailVerified) {  // Only allow verified users
          try {
            const idToken = await user.getIdToken();
            const userWithToken = { ...user, token: idToken };
            await setAuthState(userWithToken);
            setUser(userWithToken);
            setShowLogin(false);
          } catch (tokenError) {
            console.error('Error fetching token:', tokenError);
            setAuthError('Failed to get user token.');
          }
        } else {
          await clearAuthState();
          setUser(null);
          setShowLogin(true);
        }
        setInitializing(false);
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      setAuthError('Failed to initialize authentication');
      setInitializing(false);
      setShowLogin(true);
    }
  };

  checkAuthState();

  return () => {
    if (typeof unsubscribeFromAuth === 'function') {
      unsubscribeFromAuth();
    }
  };
}, []);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#ea580c" />
        <Text style={{ marginTop: 10 }}>Loading authentication...</Text>
      </View>
    );
  }

  if (authError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: 'red', fontSize: 18 }}>{authError}</Text>
        <Text style={{ marginTop: 10 }}>Please restart the app</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <AppNavigator isLoggedIn={!showLogin && !!user} />
    </NavigationContainer>
  );
}