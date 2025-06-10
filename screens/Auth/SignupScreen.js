import React, { useState, useCallback, useEffect } from 'react';
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
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { firebase } from '../../services/Firebase/firebaseConfig';
import { saveUser, isEmailAuthorized, validateAdminCode, fetchDepartments } from '../../services/Firebase/firestoreService';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
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
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setLoading(true);
        const depts = await fetchDepartments();
        if (depts && depts.length > 0) {
          setDepartments(depts);
        } else {
          Alert.alert('Warning', 'No departments found. Please contact support.');
        }
      } catch (error) {
        console.error('Error loading departments:', error);
        Alert.alert('Error', 'Failed to load departments. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    if (userType === 'staff' || userType === 'admin') {
      loadDepartments();
    }
  }, [userType]);

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

  const handleSignup = async () => {
    if (!email || !password || !confirmPassword || !name || !phoneNumber || !userId) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (!isValidEmail(email)) {
      Alert.alert('Error', `Please use a valid ${userType} email address`);
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      Alert.alert('Error', 'Please enter a valid 10-digit phone number');
      return;
    }

    if (userType === 'admin' && !validateAdminCode(userId)) {
      Alert.alert('Error', 'Invalid admin code');
      return;
    }

    if ((userType === 'staff' || userType === 'admin') && !selectedDepartment) {
      Alert.alert('Error', 'Please select a department');
      return;
    }

    setLoading(true);
    try {
      // Create user with Firebase Auth
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      
      // Save additional user data to Firestore
      await saveUser(email, name, userId, phoneNumber, userType, selectedDepartment);

      // Send email verification
      await userCredential.user.sendEmailVerification();

      setMessageType('success');
      setMessage('Account created successfully! Please verify your email before logging in.');

      // Navigate back to login after a delay
      setTimeout(() => {
        navigation.navigate('Login');
      }, 2000);

    } catch (error) {
      console.error('Signup error:', error);
      let errorMessage = 'An error occurred during signup';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters';
      }
      
      setMessageType('error');
      setMessage(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const renderDepartmentPicker = () => {
    if (userType !== 'staff' && userType !== 'admin') return null;

    return (
      <View style={styles.inputGroup}>
        <TouchableOpacity
          style={[styles.departmentPicker, !selectedDepartment && styles.placeholderPicker]}
          onPress={() => setShowDepartmentPicker(true)}
          disabled={loading}
        >
          <Text style={selectedDepartment ? styles.departmentText : styles.placeholderText}>
            {selectedDepartment || 'Select Department *'}
          </Text>
          <Icon name="chevron-down" size={24} color="#a1a1aa" />
        </TouchableOpacity>

        <Modal
          visible={showDepartmentPicker}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDepartmentPicker(false)}
        >
          <TouchableWithoutFeedback onPress={() => setShowDepartmentPicker(false)}>
            <View style={styles.modalOverlay} />
          </TouchableWithoutFeedback>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Department</Text>
            <FlatList
              data={departments}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalItem}
                  onPress={() => {
                    setSelectedDepartment(item.name);
                    setShowDepartmentPicker(false);
                  }}
                >
                  <Text style={styles.modalItemText}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </Modal>
      </View>
    );
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

            {renderDepartmentPicker()}

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

            <TouchableOpacity
              style={styles.loginLinkContainer}
              onPress={() => navigation.navigate('Login')}
              disabled={loading}
            >
              <Text style={styles.loginLinkText}>
                Already have an account? <Text style={styles.loginLinkHighlight}>Login</Text>
              </Text>
            </TouchableOpacity>
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
  inputGroup: {
    marginBottom: 22,
  },
  departmentPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#f97316',
    shadowColor: '#f97316',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  placeholderPicker: {
    borderColor: '#f97316',
  },
  departmentText: {
    color: '#161616',
    fontSize: 17,
    fontFamily: 'HelveticaNeue',
    fontWeight: '600',
  },
  placeholderText: {
    color: '#a1a1aa',
    fontSize: 17,
    fontFamily: 'HelveticaNeue',
    fontWeight: '400',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalContent: {
    position: 'absolute',
    top: '28%',
    left: '7%',
    right: '7%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    elevation: 12,
    zIndex: 2000,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 18,
    color: '#ea580c',
    textAlign: 'center',
    letterSpacing: 1,
  },
  modalItem: {
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    alignItems: 'center',
  },
  modalItemText: {
    fontSize: 18,
    color: '#161616',
    fontFamily: 'HelveticaNeue',
    fontWeight: '500',
  },
  selectedModalItem: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  loginLinkContainer: {
    marginTop: 18,
    alignItems: 'center',
  },
  loginLinkText: {
    color: '#737373',
    fontSize: 15,
    fontFamily: 'HelveticaNeue',
  },
  loginLinkHighlight: {
    color: '#f97316',
    fontWeight: 'bold',
    textDecorationLine: 'underline',
  },
});