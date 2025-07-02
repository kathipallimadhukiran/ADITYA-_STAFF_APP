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
import { saveUser, isEmailAuthorized, validateAdminCode, fetchRoleSpecificDepartments } from '../../services/Firebase/firestoreService';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

const windowWidth = Dimensions.get('window').width;

const EMAIL_DOMAINS = {
  student: ['@aec.edu.in'],
  faculty: ['@aec.edu.in', '@gmail.com'],
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
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        setLoading(true);
        let roleForDepartments;

        // Map userType to the correct role for departments
        switch (userType) {
          case 'faculty':
            roleForDepartments = 'faculty';
            break;
          case 'staff':
            roleForDepartments = 'staff';
            break;
          case 'admin':
            roleForDepartments = 'admin';
            break;
          case 'student':
            roleForDepartments = 'faculty';
            break;
          default:
            roleForDepartments = null;
        }

        if (roleForDepartments) {
          const depts = await fetchRoleSpecificDepartments(roleForDepartments);
          if (depts && depts.length > 0) {
            setDepartments(depts);
          } else {
            setMessage(`No departments found for ${userType}. Please contact support.`);
            setMessageType('error');
          }
        }
      } catch (error) {
        console.error('Error loading departments:', error);
        setMessage('Failed to load departments. Please try again.');
        setMessageType('error');
      } finally {
        setLoading(false);
      }
    };

    loadDepartments();
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
      case 'faculty':
        return 'Faculty ID';
      case 'staff':
        return 'Staff ID';
      case 'admin':
        return 'Admin Code';
      default:
        return 'ID';
    }
  };

  const handleSignup = async () => {
    // Reset any previous error messages
    setMessage('');
    setMessageType('');

    if (!email || !password || !confirmPassword || !name || !phoneNumber || !userId || !selectedDepartment) {
      setMessage('Please fill in all required fields including department');
      setMessageType('error');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      setMessageType('error');
      return;
    }

    if (!isValidEmail(email)) {
      setMessage(`Please use a valid ${userType} email address`);
      setMessageType('error');
      return;
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      setMessage('Please enter a valid 10-digit phone number');
      setMessageType('error');
      return;
    }

    // Add admin code validation
    if (userType === 'admin') {
      if (!validateAdminCode(userId)) {
        setMessage('Invalid admin code. Please check and try again.');
        setMessageType('error');
        return;
      }
    }

    setLoading(true);
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      await saveUser(email, name, userId, phoneNumber, userType, selectedDepartment);
      await userCredential.user.sendEmailVerification();

      setMessageType('success');
      setMessage('Account created successfully! Please check your email for verification.');
      setShowSuccessModal(true);
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
    const departmentLabel = userType === 'admin' ? 'Admin Role' : 'Department';

    return (
      <View style={styles.inputGroup}>
        <TouchableOpacity
          style={[styles.departmentPicker, !selectedDepartment && styles.placeholderPicker]}
          onPress={() => setShowDepartmentPicker(true)}
          disabled={loading}
        >
          <Text style={selectedDepartment ? styles.departmentText : styles.placeholderText}>
            {selectedDepartment || `Select ${departmentLabel} *`}
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
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select {departmentLabel}</Text>
                <TouchableOpacity
                  onPress={() => setShowDepartmentPicker(false)}
                  style={styles.closeButton}
                >
                  <Icon name="close" size={24} color="#f97316" />
                </TouchableOpacity>
              </View>
              <FlatList
                data={departments}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modalItem,
                      selectedDepartment === item.name && styles.selectedModalItem
                    ]}
                    onPress={() => {
                      setSelectedDepartment(item.name);
                      setShowDepartmentPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.modalItemText,
                      selectedDepartment === item.name && styles.selectedModalItemText
                    ]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
                showsVerticalScrollIndicator={true}
                contentContainerStyle={styles.modalList}
              />
            </View>
          </View>
        </Modal>
      </View>
    );
  };

  const renderSuccessModal = () => (
    <Modal
      visible={showSuccessModal}
      transparent
      animationType="fade"
      onRequestClose={() => setShowSuccessModal(false)}
    >
      <View style={styles.successModalOverlay}>
        <View style={styles.successModalContainer}>
          <View style={styles.successIconContainer}>
            <Icon name="checkmark-circle" size={80} color="#f97316" />
          </View>

          <Text style={styles.successModalTitle}>Registration Successful!</Text>

          <Text style={styles.successModalMessage}>
            Your account has been created successfully. A verification email has been sent to your email address.
          </Text>

          <Text style={styles.successModalSubMessage}>
            Please verify your email to complete the registration process.
          </Text>

          <TouchableOpacity
            style={styles.successModalButton}
            onPress={() => {
              setShowSuccessModal(false);
              navigation.navigate('Login');
            }}
          >
            <Text style={styles.successModalButtonText}>Go to Login</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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
              placeholderTextColor="#666666"
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
              placeholderTextColor="#666666"
              editable={!loading}
            />

            {renderDepartmentPicker()}

            <TextInput
              placeholder="Phone Number * (10 digits)"
              onChangeText={setPhoneNumber}
              value={phoneNumber}
              keyboardType="phone-pad"
              style={styles.input}
              placeholderTextColor="#666666"
              editable={!loading}
              maxLength={10}
            />

            <TextInput
              placeholder={`${getUserIdLabel()} *`}
              onChangeText={setUserId}
              value={userId}
              style={styles.input}
              placeholderTextColor="#666666"
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
                placeholderTextColor="#666666"
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
                placeholderTextColor="#666666"
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
      {renderSuccessModal()}
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
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  error: {
    color: '#dc2626',
    backgroundColor: '#fef2f2',
    borderColor: '#dc2626',
  },
  success: {
    color: '#16a34a',
    backgroundColor: '#f0fdf4',
    borderColor: '#16a34a',
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
    color: '#666666',
    fontSize: 17,
    fontFamily: 'HelveticaNeue',
    fontWeight: '400',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    position: 'absolute',
    top: '20%',
    left: '5%',
    right: '5%',
    maxHeight: '60%',
    backgroundColor: 'transparent',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 18,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#fff7ed',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ea580c',
    flex: 1,
    textAlign: 'center',
    marginRight: 24,
  },
  closeButton: {
    padding: 4,
  },
  modalList: {
    paddingVertical: 8,
  },
  modalItem: {
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  modalItemText: {
    fontSize: 17,
    color: '#161616',
    fontFamily: 'HelveticaNeue',
  },
  selectedModalItem: {
    backgroundColor: '#fff7ed',
  },
  selectedModalItemText: {
    color: '#f97316',
    fontWeight: '600',
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
  successModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  successModalContainer: {
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
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#fff7ed',
    
  
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  successModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#f97316',
    marginBottom: 16,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Bold',
  },
  successModalMessage: {
    fontSize: 16,
    color: '#374151',
    marginBottom: 12,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: 'HelveticaNeue',
  },
  successModalSubMessage: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue',
  },
  successModalButton: {
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
  successModalButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Medium',
  },
});