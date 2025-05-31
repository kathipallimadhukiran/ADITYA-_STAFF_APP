import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { firebase } from '../../../services/Firebase/firebaseConfig';
import { saveUser, isEmailAuthorized } from '../../../services/Firebase/firestoreService';

const AuthScreen = ({ userType, onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [id, setId] = useState(''); // Single ID field for all user types

  const handleAuth = async () => {
    try {
      if (!email || !password) {
        Alert.alert('Error', 'Please fill in all required fields');
        return;
      }

      if (!isLogin && !name) {
        Alert.alert('Error', 'Please enter your name');
        return;
      }

      // Additional validation based on user type
      if (!isLogin && !id) {
        Alert.alert('Error', `Please enter your ${userType === 'admin' ? 'Admin Code' : userType === 'student' ? 'Student ID' : 'Staff ID'}`);
        return;
      }

      if (isLogin) {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const userDoc = await firebase.firestore().collection('users').doc(email).get();
        
        if (!userDoc.exists || userDoc.data().role !== userType) {
          throw new Error(`Invalid ${userType} account`);
        }
        
        onAuthSuccess(userCredential.user);
      } else {
        // Check if the email is authorized for the role
        const isAuthorized = await isEmailAuthorized(email.trim(), userType);
        if (!isAuthorized) {
          Alert.alert('Error', `This email is not authorized for ${userType} registration. Please contact your administrator.`);
          return;
        }

        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        
        // Use saveUser function to save user data with the ID
        await saveUser(email.trim(), name, id, phoneNumber, userType);

        await userCredential.user.sendEmailVerification();
        Alert.alert('Success', 'Please verify your email address');
        onAuthSuccess(userCredential.user);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>{userType.charAt(0).toUpperCase() + userType.slice(1)} {isLogin ? 'Login' : 'Sign Up'}</Text>
        
        {!isLogin && (
          <TextInput
            style={styles.input}
            placeholder="Full Name"
            value={name}
            onChangeText={setName}
          />
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {!isLogin && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />

            <TextInput
              style={styles.input}
              placeholder={userType === 'admin' ? 'Admin Code' : `${userType.charAt(0).toUpperCase() + userType.slice(1)} ID`}
              value={id}
              onChangeText={setId}
              secureTextEntry={userType === 'admin'}
            />
          </>
        )}

        <TouchableOpacity style={styles.button} onPress={handleAuth}>
          <Text style={styles.buttonText}>{isLogin ? 'Login' : 'Sign Up'}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
          <Text style={styles.switchText}>
            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Login"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#ea580c',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: 'bold',
  },
  switchText: {
    marginTop: 20,
    color: '#ea580c',
    textAlign: 'center',
    fontSize: 14,
  },
});

export default AuthScreen; 