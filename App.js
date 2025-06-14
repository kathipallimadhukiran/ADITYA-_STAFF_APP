import React, { useEffect, useState, useMemo } from 'react';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { View, LogBox, Platform, ActivityIndicator, StatusBar, Text, TouchableOpacity } from 'react-native';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AppNavigator from './navigation/AppNavigator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProvider, useUser } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import { Provider as PaperProvider, DefaultTheme } from 'react-native-paper';
import { enableScreens } from 'react-native-screens';

// Enable native screens
enableScreens(true);

// Define custom theme
const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#1D3557',
    accent: '#457B9D',
    background: '#f8f9fa',
    surface: '#ffffff',
    text: '#1D3557',
    error: '#FF5722',
    disabled: '#C5CAE9',
    placeholder: '#6c757d',
    backdrop: 'rgba(0, 0, 0, 0.5)',
    notification: '#F94144',
  },
  roundness: 8,
};

// Debug logs for initialization
console.log('[DEBUG] App.js initializing');

LogBox.ignoreLogs([
  'AsyncStorage has been extracted from react-native core',
  'Sending...',
  'Failed to get FCM token',
  'No attendance marked for today'
]);

function AppContent() {
  const { user, setUser } = useUser();
  const [isReady, setIsReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [shouldNavigateToLogin, setShouldNavigateToLogin] = useState(false);

  const initializeAuth = async () => {
    try {
      console.log('[DEBUG] Starting auth initialization');
      setIsReady(false);

      // Get stored user data
      const storedUserData = await AsyncStorage.getItem('@user_data');
      const isLoggedIn = await AsyncStorage.getItem('@is_logged_in');

      if (storedUserData && isLoggedIn === 'true') {
        console.log('[DEBUG] Found stored user data');
        const userData = JSON.parse(storedUserData);
        setUser(userData);
        setIsReady(true);
        setShouldNavigateToLogin(false);
      } else {
        console.log('[DEBUG] No stored user data found');
        setUser(null);
        setIsReady(true);
        setShouldNavigateToLogin(true);
      }
    } catch (error) {
      console.error('[DEBUG] Auth initialization error:', error);
      setAuthError('Failed to initialize authentication. Please restart the app.');
      setIsReady(true);
    }
  };

  // Handle auth state changes and restore session
  useEffect(() => {
    initializeAuth();
  }, []);

  // Compute navigation state only when user changes
  const navigationState = useMemo(() => {
    return {
      isLoggedIn: !!user?.email,
      isReady: isReady,
      userRole: user?.role?.toLowerCase(),
      shouldNavigateToLogin: !user?.email || shouldNavigateToLogin
    };
  }, [user?.email, user?.role, shouldNavigateToLogin, isReady]);

  if (!isReady) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={{ marginTop: 10, color: theme.colors.primary }}>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (authError) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Text style={{ color: theme.colors.error, fontSize: 18, textAlign: 'center' }}>{authError}</Text>
        <TouchableOpacity 
          style={{ 
            marginTop: 20, 
            padding: 10, 
            backgroundColor: theme.colors.primary,
            borderRadius: 5
          }}
          onPress={async () => {
            setAuthError(null);
            setIsReady(false);
            await initializeAuth();
          }}
        >
          <Text style={{ color: 'white' }}>Try Again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <NavigationContainer>
      <AppNavigator {...navigationState} />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#1D3557" />
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <ErrorBoundary>
            <UserProvider>
              <AppContent />
            </UserProvider>
          </ErrorBoundary>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}