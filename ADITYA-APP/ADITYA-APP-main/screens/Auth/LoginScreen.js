import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView } from 'react-native';
import LottieView from 'lottie-react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase } from '../../services/Firebase/firebaseConfig';
import { fetchUser, isEmailAuthorized } from '../../services/Firebase/firestoreService';
import { setAuthState } from '../../services/Firebase/authUtils';
import { ActivityIndicator } from 'react-native';
import { clearAuthState } from '../../services/Firebase/authUtils';
import { useUser } from '../../context/UserContext';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Dimensions, Platform } from 'react-native';

const LoginScreen = () => {
  const { setUser } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setMessage('');
    setMessageType('');
    setLoading(true);

    // Basic validation
    if (!email.trim() || !password) {
      setMessageType('error');
      setMessage('Please enter both email and password.');
      setLoading(false);
      return;
    }

    try {
      // Sign in with Firebase
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email.trim(), password);

      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        await firebase.auth().signOut();
        setMessageType('error');
        setMessage('Please verify your email before logging in. Check your inbox for the verification email.');
        setLoading(false);
        return;
      }

      // Fetch additional user data from Firestore
      const userData = await fetchUser(email.trim());
      if (!userData) {
        setMessageType('error');
        setMessage('Your account exists but profile data is missing. Please contact support.');
        setLoading(false);
        return;
      }

      // Check if the email is authorized for the role
      const isAuthorized = await isEmailAuthorized(email.trim(), userData.role);
      if (!isAuthorized) {
        await firebase.auth().signOut();
        setMessageType('error');
        setMessage(`This email is not authorized for ${userData.role} access. Please contact your administrator.`);
        setLoading(false);
        return;
      }

      // Create complete user object
      const completeUser = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified,
        ...userData,
        lastLogin: new Date().toISOString()
      };

      // Persist user session
      await setAuthState(completeUser);
      setUser(completeUser);

      // Update Firestore with last login time
      await updateUserLastLogin(email.trim());

      setMessageType('success');
      setMessage('Login successful! Redirecting...');

      // Navigate based on user role
      switch (userData.role) {
        case 'student':
          navigation.navigate('StudentDashboard');
          break;
        case 'staff':
          navigation.navigate('StaffDashboard');
          break;
        case 'admin':
          navigation.navigate('AdminDashboard');
          break;
        default:
          setMessageType('error');
          setMessage('Invalid user role. Please contact support.');
          await firebase.auth().signOut();
          break;
      }

      // Clear form fields
      setEmail('');
      setPassword('');

    } catch (err) {
      let errorMessage = 'Login failed. Please try again.';
      
      switch (err.code) {
        case 'auth/user-not-found':
          errorMessage = 'No account found with this email.';
          break;
        case 'auth/wrong-password':
          errorMessage = 'Incorrect password. Please try again.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Too many attempts. Account temporarily locked. Try again later.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Network error. Please check your internet connection.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Invalid email format. Please enter a valid email.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This account has been disabled. Please contact support.';
          break;
      }

      setMessageType('error');
      setMessage(errorMessage);
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  // Add this helper function to your firestoreService.js
  const updateUserLastLogin = async (email) => {
    try {
      const userRef = firebase.firestore().collection('users').doc(email);
      await userRef.update({
        lastLogin: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  };

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

          <TextInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            placeholderTextColor="#a1a1aa"
          />

          <View style={styles.passwordWrapper}>
            <TextInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
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

          <TouchableOpacity
            style={[styles.button, styles.signupButton]}
            onPress={() => navigation.navigate('RoleSelection')}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, styles.signupButtonText]}>Go to Sign Up</Text>
          </TouchableOpacity>

          {!!message && (
            <Text style={[styles.message, messageType === 'error' ? styles.error : styles.success]}>
              {message}
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
  input: {
    height: 52,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    borderRadius: 12,
    borderColor: '#f97316',
    borderWidth: 1.8,
    marginBottom: 22,
    fontSize: 17,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
    color: '#1f2937',
  },
  passwordWrapper: {
    position: 'relative',
    marginBottom: 28,
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
  signupButton: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#16a34a',
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
  signupButtonText: {
    color: '#16a34a',
    fontWeight: '700',
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
  },
  success: {
    color: '#16a34a',
  },
});

export default LoginScreen;
