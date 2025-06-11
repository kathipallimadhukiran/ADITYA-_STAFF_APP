import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Alert, Modal } from 'react-native';
import LottieView from 'lottie-react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase } from '../../services/Firebase/firebaseConfig';
import { fetchUser, isEmailAuthorized, updateUserLastLogin, checkAdminVerificationStatus } from '../../services/Firebase/firestoreService';
import { setAuthState } from '../../services/Firebase/authUtils';
import { ActivityIndicator } from 'react-native';
import { clearAuthState } from '../../services/Firebase/authUtils';
import { useUser } from '../../context/UserContext';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dimensions, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/Firebase/firebaseConfig';

const LoginScreen = () => {
  const { setUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false);

  const registerAndSavePushToken = async (email) => {
    try {
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
  
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const expoPushToken = tokenData.data;
  
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
      return null;
    }
  };

  const handleLogin = async () => {
    // Reset previous errors
    setEmailError('');
    setPasswordError('');
    setMessage('');
    setMessageType('');

    // Validate inputs
    if (!email.trim() && !password.trim()) {
      setEmailError('Email is required');
      setPasswordError('Password is required');
      return;
    }
    if (!email.trim()) {
      setEmailError('Email is required');
      return;
    }
    if (!password.trim()) {
      setPasswordError('Password is required');
      return;
    }

    setLoading(true);
    try {
      // Sign in with Firebase Auth
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      
      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        await firebase.auth().signOut();
        setMessageType('error');
        setVerificationEmail(email);
        setShowVerificationModal(true);
        setLoading(false);
        return;
      }

      // Fetch additional user data from Firestore
      const userData = await fetchUser(email);
      if (!userData) {
        setMessageType('error');
        setMessage('Your account exists but profile data is missing. Please contact support.');
        setLoading(false);
        return;
      }

      // Check if the email is authorized for the role
      const isAuthorized = await isEmailAuthorized(email, userData.role);
      if (!isAuthorized) {
        await firebase.auth().signOut();
        setMessageType('error');
        setMessage(`This email is not authorized for ${userData.role} access. Please contact your administrator.`);
        setLoading(false);
        return;
      }

      // Update last login in Firestore
      await updateUserLastLogin(email);

      // Register and save push notification token
      await registerAndSavePushToken(email);

      // Create complete user object
      const completeUser = {
        uid: userCredential.user.uid,
        email: userCredential.user.email.toLowerCase().trim(),
        emailVerified: userCredential.user.emailVerified,
        ...userData,
        role: userData.role?.toLowerCase(),
        lastLogin: new Date().toISOString()
      };

      console.log('[DEBUG] Setting user context:', completeUser);

      // First persist the session
      await setAuthState(completeUser);

      // Then update the context
      setUser(completeUser);

      // Navigate to appropriate dashboard
      const dashboardScreen = getDashboardScreen(userData.role);
      navigation.navigate(dashboardScreen);

    } catch (error) {
      console.error('Login error:', error);
      
      // Handle specific error cases with user-friendly messages
      if (error.code === 'auth/user-not-found') {
        setEmailError('No account found with this email');
      } else if (error.code === 'auth/wrong-password') {
        setPasswordError('Incorrect password');
      } else if (error.code === 'auth/invalid-email') {
        setEmailError('Please enter a valid email address');
      } else if (error.code === 'auth/too-many-requests') {
        setMessage('Too many failed attempts. Please try again later.');
        setMessageType('error');
      } else {
        setMessage('Unable to sign in. Please check your credentials and try again.');
        setMessageType('error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setLoading(true);
      const user = await firebase.auth().signInWithEmailAndPassword(verificationEmail, password);
      await user.user.sendEmailVerification();
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

  const getDashboardScreen = (role) => {
    switch (role?.toLowerCase()) {
      case 'admin':
        return 'AdminDashboard';
      case 'staff':
      case 'faculty':
        return 'StaffDashboard';
      default:
        return 'StudentDashboard';
    }
  };

  const handleForgotPassword = async () => {
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

    try {
      setLoading(true);
      await firebase.auth().sendPasswordResetEmail(forgotPasswordEmail);
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <Text style={styles.heading}>ADITYA UNIVERSITY</Text>

          <View style={styles.lottieContainer}>
            <LottieView
              source={require('../../assets/lottie/loginlottie.json')}
              autoPlay
              loop
              style={styles.lottie}
            />
          </View>

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

          <View style={styles.inputContainer}>
            <View style={[styles.passwordWrapper, passwordError && styles.inputError]}>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  setPasswordError(''); // Clear error when user types
                }}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                placeholderTextColor="#a1a1aa"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                activeOpacity={0.7}
              >
                <Icon
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={24}
                  color="#f97316"
                />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
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
    color: '#ea580c',
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 25,
    fontFamily: 'HelveticaNeue-Bold',
  },
  lottieContainer: {
    alignItems: 'center',
    marginBottom: 25,
  },
  lottie: {
    width: windowWidth * 0.6,
    height: windowWidth * 0.6,
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
  passwordWrapper: {
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
  eyeIcon: {
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
});

export default LoginScreen;
