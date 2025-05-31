import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ScrollView,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Modal,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase } from '../../services/Firebase/firebaseConfig';
import { saveUser, isEmailAuthorized, validateAdminCode } from '../../services/Firebase/firestoreService';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

const windowWidth = Dimensions.get('window').width;

const EMAIL_DOMAINS = {
  student: ['@aec.edu.in'],
  staff: ['@aec.edu.in', '@gmail.com'],
  admin: ['@aec.edu.in', '@gmail.com']
};

export default function SignupScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const userType = route.params?.userType || 'student';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showFaceModal, setShowFaceModal] = useState(false);

  const isValidEmail = (email) => {
    const lowerEmail = email.toLowerCase();
    return EMAIL_DOMAINS[userType].some(domain => lowerEmail.endsWith(domain.toLowerCase()));
  };

  const isValidPhoneNumber = (phone) => /^[0-9]{10}$/.test(phone);

  const getUserIdLabel = () => {
    switch (userType) {
      case 'student':
        return 'Student ID';
      case 'staff':
        return 'Staff ID';
      case 'admin':
        return 'Admin Code';
      default:
        return 'ID';
    }
  };

  const handleSignup = useCallback(async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    const trimmedConfirmPassword = confirmPassword.trim();
    const trimmedPhone = phoneNumber.trim();
    const trimmedUserId = userId.trim();

    setMessage('');
    setMessageType('');

    if (!trimmedName || !trimmedEmail || !trimmedPassword || !trimmedConfirmPassword || !trimmedPhone || !trimmedUserId) {
      setMessageType('error');
      setMessage('Please fill in all required fields.');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setMessageType('error');
      setMessage(`Email must be a valid ${userType} email (${EMAIL_DOMAINS[userType].join(', ')}).`);
      return;
    }

    if (!isValidPhoneNumber(trimmedPhone)) {
      setMessageType('error');
      setMessage('Please enter a valid 10-digit phone number.');
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setMessageType('error');
      setMessage('Passwords do not match.');
      return;
    }

    if (userType === 'admin' && !validateAdminCode(trimmedUserId)) {
      setMessageType('error');
      setMessage('Invalid admin code.');
      return;
    }

    setLoading(true);

    try {
      // Check if the email is authorized
      const isAuthorized = await isEmailAuthorized(trimmedEmail, userType);
      if (!isAuthorized) {
        setMessageType('error');
        setMessage(`This email is not authorized for ${userType} registration. Please contact your administrator.`);
        setLoading(false);
        return;
      }

      const userCredential = await firebase.auth().createUserWithEmailAndPassword(trimmedEmail, trimmedPassword);
      await userCredential.user.sendEmailVerification();
      await saveUser(trimmedEmail, trimmedName, trimmedUserId, trimmedPhone, userType);

      setMessageType('success');
      setMessage('Registered! Please check your email for verification.');

      // Sign out the newly created user immediately
      await firebase.auth().signOut();

      // Show face capture modal for staff only
      if (userType === 'staff') {
        setShowFaceModal(true);
      } else {
        // Navigate back to login for other roles
        navigation.navigate('Login');
      }
    } catch (error) {
      let friendlyMessage = error.message;
      switch (error.code) {
        case 'auth/email-already-in-use':
          friendlyMessage = 'This email is already registered.';
          break;
        case 'auth/invalid-email':
          friendlyMessage = 'Invalid email format.';
          break;
        case 'auth/weak-password':
          friendlyMessage = 'Password should be at least 6 characters.';
          break;
      }
      setMessageType('error');
      setMessage(friendlyMessage);
    } finally {
      setLoading(false);
    }
  }, [name, email, password, confirmPassword, phoneNumber, userId, userType, navigation]);

  const handleFaceCapture = () => {
    setShowFaceModal(false);
    navigation.navigate('FaceCaptureScreen', { email });
  };

  const handleSkipFaceCapture = () => {
    setShowFaceModal(false);
    // Clear form fields
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setName('');
    setPhoneNumber('');
    setUserId('');

    // Navigate back to login
    navigation.navigate('Login');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
            <TouchableOpacity 
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Icon name="arrow-back" size={24} color="#f97316" />
            </TouchableOpacity>

            <Text style={styles.heading}>ADITYA UNIVERSITY</Text>
            <Text style={styles.title}>{userType.charAt(0).toUpperCase() + userType.slice(1)} Sign Up</Text>
            <Text style={styles.instruction}>
              Only {userType}s with an official Aditya University email ({EMAIL_DOMAINS[userType].join(', ')}) can sign up.
            </Text>

            <TextInput
              placeholder="Full Name *"
              onChangeText={setName}
              value={name}
              style={styles.input}
              placeholderTextColor="#a1a1aa"
              autoCapitalize="words"
              editable={!loading}
            />

            <TextInput
              placeholder={`Email * (e.g., user${EMAIL_DOMAINS[userType][0]})`}
              onChangeText={setEmail}
              value={email}
              autoCapitalize="none"
              keyboardType="email-address"
              style={styles.input}
              placeholderTextColor="#a1a1aa"
              editable={!loading}
            />

            <TextInput
              placeholder="Phone Number * (10 digits)"
              onChangeText={setPhoneNumber}
              value={phoneNumber}
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor="#a1a1aa"
              editable={!loading}
              maxLength={10}
            />

            <TextInput
              placeholder={`${getUserIdLabel()} *`}
              onChangeText={setUserId}
              value={userId}
              style={styles.input}
              placeholderTextColor="#a1a1aa"
              editable={!loading}
              secureTextEntry={userType === 'admin'}
            />

            <View style={styles.passwordWrapper}>
              <TextInput
                placeholder="Password *"
                onChangeText={setPassword}
                value={password}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                placeholderTextColor="#a1a1aa"
                editable={!loading}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon} activeOpacity={0.7}>
                <Icon name={showPassword ? 'eye' : 'eye-off'} size={24} color="#f97316" />
              </TouchableOpacity>
            </View>

            <View style={styles.passwordWrapper}>
              <TextInput
                placeholder="Confirm Password *"
                onChangeText={setConfirmPassword}
                value={confirmPassword}
                secureTextEntry={!showConfirmPassword}
                style={styles.passwordInput}
                placeholderTextColor="#a1a1aa"
                editable={!loading}
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                activeOpacity={0.7}
              >
                <Icon name={showConfirmPassword ? 'eye' : 'eye-off'} size={24} color="#f97316" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleSignup}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>Sign Up</Text>}
            </TouchableOpacity>

            {message ? (
              <Text style={[styles.message, messageType === 'error' ? styles.error : styles.success]}>
                {message}
              </Text>
            ) : null}

            <Modal visible={showFaceModal} transparent animationType="slide" onRequestClose={() => setShowFaceModal(false)}>
              <View style={styles.modalContainer}>
                <View style={styles.modalContent}>
                  <Text style={styles.modalTitle}>Face Capture</Text>
                  <Text style={styles.modalText}>
                    Please capture your face for attendance or skip to go to Login page.
                  </Text>

                  <TouchableOpacity style={styles.modalButtonPrimary} onPress={handleFaceCapture}>
                    <Text style={styles.modalButtonText}>Capture Face</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.modalButtonSecondary} onPress={handleSkipFaceCapture}>
                    <Text style={styles.modalButtonText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
          </ScrollView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff7ed',
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 30,
    paddingVertical: 40,
  },
  backButton: {
    marginBottom: 20,
  },
  heading: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ea580c',
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 10,
    fontFamily: 'HelveticaNeue-Bold',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Medium',
  },
  instruction: {
    textAlign: 'center',
    color: '#737373',
    fontSize: 14,
    marginBottom: 25,
    fontFamily: 'HelveticaNeue',
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
    color: '#161616',
    fontFamily: 'HelveticaNeue',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderColor: '#f97316',
    borderWidth: 1.8,
    borderRadius: 12,
    marginBottom: 22,
    backgroundColor: '#fff',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
  },
  passwordInput: {
    flex: 1,
    height: 52,
    paddingHorizontal: 18,
    fontSize: 17,
    color: '#161616',
    fontFamily: 'HelveticaNeue',
  },
  eyeIcon: {
    paddingHorizontal: 10,
  },
  button: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.7,
    shadowRadius: 15,
    elevation: 10,
    marginBottom: 10,
  },
  buttonText: {
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 18,
    color: 'white',
    letterSpacing: 1,
    fontFamily: 'HelveticaNeue-Medium',
  },
  message: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 14,
    fontFamily: 'HelveticaNeue',
  },
  error: {
    color: '#dc2626',
  },
  success: {
    color: '#16a34a',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 30,
  },
  modalContent: {
    backgroundColor: '#fff7ed',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 15,
    color: '#ea580c',
  },
  modalText: {
    fontSize: 16,
    marginBottom: 25,
    color: '#4b5563',
    textAlign: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#f97316',
    paddingVertical: 14,
    paddingHorizontal: 45,
    borderRadius: 12,
    marginBottom: 15,
  },
  modalButtonSecondary: {
    backgroundColor: '#6b7280',
    paddingVertical: 14,
    paddingHorizontal: 45,
    borderRadius: 12,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
