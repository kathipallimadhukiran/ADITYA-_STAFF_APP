import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, ScrollView, Alert } from 'react-native';
import LottieView from 'lottie-react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase } from '../../services/Firebase/firebaseConfig';
import { fetchUser, isEmailAuthorized, updateUserLastLogin } from '../../services/Firebase/firestoreService';
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
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      // Sign in with Firebase Auth
      const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
      
      // Update last login in Firestore
      await updateUserLastLogin(email);

      // Check if email is verified
      if (!userCredential.user.emailVerified) {
        await firebase.auth().signOut();
        setMessageType('error');
        setMessage('Please verify your email before logging in. Check your inbox for the verification email.');
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

      // Create complete user object
      const completeUser = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        emailVerified: userCredential.user.emailVerified,
        ...userData,
        role: userData.role?.toLowerCase(),
        lastLogin: new Date().toISOString()
      };

      // Set user context and persist session
      setUser(completeUser);
      await setAuthState(completeUser);

      // Navigate based on role
      const role = userData.role?.toLowerCase();
      
      // Let App.js handle the navigation by updating user context
      // This will trigger the navigation through AppNavigator
      setMessageType('success');
      setMessage('Login successful!');

    } catch (error) {
      console.error('Login error:', error);
      let errorMessage = 'An error occurred during login';
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid password';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      }
      
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
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
