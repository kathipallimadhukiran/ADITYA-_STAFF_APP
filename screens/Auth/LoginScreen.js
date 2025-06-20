import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Alert, Modal, Image, Animated, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase, getAuth, db, isInitialized } from '../../services/Firebase/firebaseConfig';
import { fetchUser, isEmailAuthorized, updateUserLastLogin, checkAdminVerificationStatus } from '../../services/Firebase/firestoreService';
import { setAuthState, clearAuthState } from '../../services/Firebase/authUtils';
import { ActivityIndicator } from 'react-native';
import { useUser } from '../../context/UserContext';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dimensions, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../context/AuthContext';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getUserData } from '../../services/Firebase/firestoreService';

// Helper function to get dashboard screen name
const getDashboardScreen = (role) => {
  if (!role) return 'StudentDashboard';
  
  const normalizedRole = role.toLowerCase().trim();
  
  // Map faculty role to StaffDashboard
  if (normalizedRole === 'faculty') {
    console.log('[DEBUG] Faculty user, redirecting to StaffDashboard');
    return 'StaffDashboard';
  }
  
  const validRoles = ['student', 'staff', 'admin'];
  
  if (!validRoles.includes(normalizedRole)) {
    console.error(`[NAVIGATION ERROR] Invalid role: ${role}`);
    return 'StudentDashboard';
  }
  
  const dashboardName = `${normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)}Dashboard`;
  console.log('[DEBUG] Navigating to dashboard:', dashboardName);
  return dashboardName;
};

const LoginScreen = ({ navigation }) => {
  const { login } = useAuth();
  const { user, setUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    checkAutoLogin();
  }, []);

  useEffect(() => {
    if (loading || isInitializing) {
      // Reset animations
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.95);

      // Start parallel animations
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
      ]).start(() => {
        // After initial animation, start subtle floating effect
        Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, {
              toValue: 1.05,
              duration: 1500,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: true,
            }),
            Animated.timing(scaleAnim, {
              toValue: 1,
              duration: 1500,
              easing: Easing.bezier(0.4, 0, 0.2, 1),
              useNativeDriver: true,
            }),
          ])
        ).start();
      });
    }
  }, [loading, isInitializing, fadeAnim, scaleAnim]);

  const checkAutoLogin = async () => {
    try {
      setIsInitializing(true);
      
      // Check if user data exists
      const storedUserData = await AsyncStorage.getItem('@user_data');
      const storedEmail = await AsyncStorage.getItem('@user_email');
      const storedPassword = await AsyncStorage.getItem('@user_password');

      if (storedUserData && storedEmail && storedPassword) {
        // Attempt to restore Firebase session
        try {
          const userCredential = await firebase.auth().signInWithEmailAndPassword(storedEmail, storedPassword);
          const userData = JSON.parse(storedUserData);
          
          if (userCredential.user.emailVerified) {
            // Update user context
            await login(userData);
            
            // Get the appropriate dashboard screen
            const dashboardScreen = getDashboardScreen(userData.role);

            // Debug log before navigation
            console.log('[DEBUG] Auto-login successful:', {
              email: userData.email,
              role: userData.role,
              navigatingTo: dashboardScreen
            });

            // Navigate to appropriate dashboard
            navigation.reset({
              index: 0,
              routes: [{ name: dashboardScreen }],
            });
            return;
          }
        } catch (error) {
          console.error('[AUTO-LOGIN ERROR]:', error);
          // Clear stored credentials if auto-login fails
          await clearAuthState();
        }
      }
    } catch (error) {
      console.error('Error during auto-login check:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    // Check Firebase initialization
    if (!isInitialized()) {
      Alert.alert(
        'Error',
        'Firebase services are not initialized. Please restart the app.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Clear any existing auth state on mount
    const clearExistingAuth = async () => {
      try {
        await clearAuthState();
        setUser(null);
        // Let the navigation be handled by the AuthContext
      } catch (error) {
        console.error('Error clearing auth state:', error);
      }
    };

    clearExistingAuth();
  }, [setUser]);

  useEffect(() => {
    // If user is already authenticated, navigate to appropriate dashboard
    if (user) {
      const dashboardScreen = getDashboardScreen(user.role);
      
      // Debug log before navigation
      console.log('[DEBUG] User state change navigation:', {
        email: user.email,
        role: user.role,
        navigatingTo: dashboardScreen
      });

      navigation.reset({
        index: 0,
        routes: [{ name: dashboardScreen }],
      });
    }
  }, [user, navigation]);

  const registerAndSavePushToken = async (email) => {
    try {
      // Check if running on a physical device
      const isPhysicalDevice = Platform.OS !== 'web' && !__DEV__;
      if (!isPhysicalDevice) {
        console.log('Push notifications are only available on physical devices');
        return null;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
  
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
  
      if (finalStatus !== 'granted') {
        console.log('Failed to get push notification permissions');
        return null;
      }
  
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: require('../../app.json').expo.extra.eas.projectId
      });
      const expoPushToken = tokenData.data;
  
      if (!db) {
        throw new Error('Firestore is not initialized');
      }
  
      // Save the token to the user's document with lowercase email
      const lowerEmail = email.toLowerCase().trim();
      const userRef = doc(db, 'users', lowerEmail);
      await updateDoc(userRef, {
        expoPushToken,
        tokenLastUpdated: new Date().toISOString()
      });
  
      console.log('Successfully saved push token:', expoPushToken);
      return expoPushToken;
    } catch (error) {
      console.error('Error saving push token:', error);
      // Don't throw the error - just return null as this is not critical for login
      return null;
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      setMessage('');

      // Validate email and password
      if (!email || !password) {
        setMessage('Please enter both email and password');
        setMessageType('error');
        return;
      }

      // Sign in with Firebase
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      
      if (!userCredential.user.emailVerified) {
        setVerificationEmail(email);
        setShowVerificationModal(true);
        await firebase.auth().signOut();
        return;
      }

      // Get user data from Firestore
      const userDoc = await firebase.firestore()
        .collection('users')
        .doc(email.toLowerCase())
        .get();

      if (!userDoc.exists) {
        setMessage('User data not found');
        setMessageType('error');
        return;
      }

      const userData = {
        ...userDoc.data(),
        uid: userCredential.user.uid,
        email: email.toLowerCase(),
        emailVerified: userCredential.user.emailVerified
      };

      // Validate user role
      if (!userData.role) {
        console.error('[AUTH ERROR] User role not found:', userData);
        setMessage('User role not found. Please contact support.');
        setMessageType('error');
        return;
      }

      // Always store credentials for auto-login
      await Promise.all([
        AsyncStorage.setItem('@user_email', email.toLowerCase()),
        AsyncStorage.setItem('@user_password', password),
        AsyncStorage.setItem('@user_data', JSON.stringify(userData)),
        AsyncStorage.setItem('@is_logged_in', 'true')
      ]);

      // Update user context
      await login(userData);
      
      // Register push token
      await registerAndSavePushToken(email);

      // Get the appropriate dashboard screen
      const dashboardScreen = getDashboardScreen(userData.role);

      // Debug log before navigation
      console.log('[DEBUG] Login successful:', {
        email: userData.email,
        role: userData.role,
        navigatingTo: dashboardScreen
      });

      // Navigate to appropriate dashboard
      navigation.reset({
        index: 0,
        routes: [{ name: dashboardScreen }],
      });

    } catch (error) {
      console.error('[LOGIN ERROR]:', error);
      let errorMessage = 'An error occurred during login. Please try again.';
      
      // Handle specific Firebase auth errors
      switch (error.code) {
        case 'auth/invalid-email':
          errorMessage = 'Invalid email address format.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled. Please contact support.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many failed login attempts. Please try again later.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
      }
      
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth) {
      Alert.alert('Error', 'Authentication service is not available');
      return;
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, verificationEmail, password);
      await userCredential.user.sendEmailVerification();
      setMessage('Verification email sent! Please check your inbox.');
      setMessageType('success');
      setShowVerificationModal(false);
    } catch (error) {
      console.error('Error sending verification email:', error);
      setMessage('Failed to send verification email. Please try again later.');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!auth) {
      Alert.alert('Error', 'Authentication service is not available');
      return;
    }

    if (!email) {
      setForgotPasswordEmail('');
      setShowForgotPasswordModal(true);
      return;
    }
    setForgotPasswordEmail(email);
    setShowForgotPasswordModal(true);
  };

  const handleSendResetEmail = async () => {
    if (!forgotPasswordEmail) {
      setMessage('Please enter your email address');
      setMessageType('error');
      return;
    }

    if (!auth) {
      Alert.alert('Error', 'Authentication service is not available');
      return;
    }

    try {
      setLoading(true);
      await auth.sendPasswordResetEmail(forgotPasswordEmail);
      setForgotPasswordSuccess(true);
    } catch (error) {
      let errorMessage = 'Failed to send password reset email';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account exists with this email';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Please enter a valid email address';
      }
      setMessage(errorMessage);
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const renderVerificationModal = () => (
    <Modal
      visible={showVerificationModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowVerificationModal(false)}
    >
      <View style={styles.verificationModalOverlay}>
        <View style={styles.verificationModalContainer}>
          <View style={styles.verificationIconContainer}>
            <Icon name="mail-unread" size={80} color="#f97316" />
          </View>

          <Text style={styles.verificationModalTitle}>Email Not Verified</Text>

          <Text style={styles.verificationModalMessage}>
            Please verify your email address before logging in. We've sent a verification link to your email.
          </Text>

          <Text style={styles.verificationModalSubMessage}>
            Haven't received the email? Click below to resend verification link.
          </Text>

          <TouchableOpacity
            style={styles.verificationModalButton}
            onPress={handleResendVerification}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.verificationModalButtonText}>Resend Verification Email</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.verificationModalCloseButton}
            onPress={() => setShowVerificationModal(false)}
          >
            <Text style={styles.verificationModalCloseText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderForgotPasswordModal = () => (
    <Modal
      visible={showForgotPasswordModal}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setShowForgotPasswordModal(false);
        setForgotPasswordSuccess(false);
      }}
    >
      <View style={styles.verificationModalOverlay}>
        <View style={styles.verificationModalContainer}>
          <View style={styles.verificationIconContainer}>
            <Icon 
              name={forgotPasswordSuccess ? "checkmark-circle" : "key"} 
              size={80} 
              color="#f97316" 
            />
          </View>

          {!forgotPasswordSuccess ? (
            <>
              <Text style={styles.verificationModalTitle}>Reset Password</Text>

              <Text style={styles.verificationModalMessage}>
                Enter your email address and we'll send you instructions to reset your password.
              </Text>

              <TextInput
                placeholder="Enter your email"
                value={forgotPasswordEmail}
                onChangeText={setForgotPasswordEmail}
                style={[styles.input, { marginBottom: 20, width: '100%' }]}
                placeholderTextColor="#666666"
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={styles.verificationModalButton}
                onPress={handleSendResetEmail}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.verificationModalButtonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.verificationModalTitle}>Email Sent!</Text>

              <Text style={styles.verificationModalMessage}>
                Password reset instructions have been sent to your email address.
              </Text>

              <Text style={styles.verificationModalSubMessage}>
                Please check your inbox and follow the instructions to reset your password.
              </Text>

              <TouchableOpacity
                style={styles.verificationModalButton}
                onPress={() => {
                  setShowForgotPasswordModal(false);
                  setForgotPasswordSuccess(false);
                }}
              >
                <Text style={styles.verificationModalButtonText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          )}

          {!forgotPasswordSuccess && (
            <TouchableOpacity
              style={styles.verificationModalCloseButton}
              onPress={() => {
                setShowForgotPasswordModal(false);
                setForgotPasswordSuccess(false);
              }}
            >
              <Text style={styles.verificationModalCloseText}>Close</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );

  if (isInitializing || loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Animated.View style={{ 
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          alignItems: 'center'
        }}>
          <Image
            source={require('../../assets/college-logo.png')}
            style={{
              width: 150,
              height: 150,
              resizeMode: 'contain'
            }}
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.heading}>ADITYA UNIVERSITY</Text>

          <Animated.View style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }]
            }
          ]}>
            <Image
              source={require('../../assets/college-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          <Text style={styles.title}>Email Login</Text>

          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Email"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                setEmailError(''); // Clear error when user types
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, emailError && styles.inputError]}
              placeholderTextColor="#a1a1aa"
            />
            {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
          </View>

          <View style={styles.passwordContainer}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="Password"
              placeholderTextColor="#a1a1aa"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.showPasswordButton}
              onPress={() => setShowPassword(!showPassword)}
            >
              <Icon
                name={showPassword ? 'eye-off' : 'eye'}
                size={24}
                color="#457B9D"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.forgotPasswordButton}
            onPress={handleForgotPassword}
            disabled={loading}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, loading && styles.disabledButton]} 
            onPress={handleLogin} 
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          {/* Sign up link below login button */}
          <TouchableOpacity
            style={styles.signupLinkContainer}
            onPress={() => navigation.navigate('RoleSelection')}
            disabled={loading}
          >
            <Text style={styles.signupLinkText}>
              Don't have an account? <Text style={styles.signupLinkHighlight}>Sign Up</Text>
            </Text>
          </TouchableOpacity>

          {!!message && (
            <Text style={[styles.message, messageType === 'error' ? styles.error : styles.success]}>
              {message}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      {renderVerificationModal()}
      {renderForgotPasswordModal()}
    </SafeAreaView>
  );
};

const windowWidth = Dimensions.get('window').width;
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff7ed',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  heading: {
    fontSize: 36,
    fontWeight: '900',
    color: '#C19539',
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 25,
    fontFamily: 'HelveticaNeue-Bold',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 25,
    width: '100%',
    height: 200, // Adjust this value based on your needs
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 30,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Medium',
  },
  inputContainer: {
    marginBottom: 8,
  },
  input: {
    height: 52,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    borderRadius: 12,
    borderColor: '#f97316',
    borderWidth: 1.8,
    marginBottom: 4,
    fontSize: 17,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
    color: '#1f2937',
  },
  inputError: {
    borderColor: '#dc2626',
    borderWidth: 1.8,
    shadowColor: '#dc2626',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  passwordContainer: {
    position: 'relative',
    marginBottom: 4,
  },
  passwordInput: {
    height: 52,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingRight: 48,
    borderRadius: 12,
    borderColor: '#f97316',
    borderWidth: 1.8,
    fontSize: 17,
    color: '#1f2937',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  showPasswordButton: {
    position: 'absolute',
    right: 15,
    top: '35%',
    transform: [{ translateY: -12 }],
    padding: 5,
  },
  button: {
    backgroundColor: '#ea580c',
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 18,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 7,
    elevation: 8,
  },
  signupLinkContainer: {
    marginTop: -10,
    marginBottom: 18,
    alignItems: 'center',
  },
  signupLinkText: {
    color: '#737373',
    fontSize: 15,
    fontFamily: 'HelveticaNeue',
  },
  signupLinkHighlight: {
    color: '#16a34a',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
  disabledButton: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontWeight: '700',
    textAlign: 'center',
    fontSize: 19,
  },
  message: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    fontFamily: 'HelveticaNeue-Medium',
  },
  error: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
    marginTop: 10,
  },
  success: {
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#16a34a',
    marginTop: 10,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginRight: 10,
  },
  forgotPasswordText: {
    color: '#f97316',
    fontSize: 14,
    fontWeight: '600',
  },
  verificationModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  verificationModalContainer: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  verificationIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff7ed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  verificationModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f97316',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Bold',
  },
  verificationModalMessage: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'HelveticaNeue',
  },
  verificationModalSubMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue',
  },
  verificationModalButton: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  verificationModalButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Medium',
  },
  verificationModalCloseButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  verificationModalCloseText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff7ed',
  },
});

export default LoginScreen;
