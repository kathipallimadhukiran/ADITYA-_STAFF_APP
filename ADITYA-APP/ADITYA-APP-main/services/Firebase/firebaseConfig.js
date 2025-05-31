import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDzSZEvDMQ9w7oI5vo-JycaZoGSykbl6fQ",
  authDomain: "testing-auth-543a4.firebaseapp.com",
  projectId: "testing-auth-543a4",
  storageBucket: "testing-auth-543a4.appspot.com",
  messagingSenderId: "398260959798",
  appId: "1:398260959798:web:ab8c632c432ee77abff697"
};

// Initialize Firebase if not already initialized
let app;
if (!firebase.apps.length) {
  app = firebase.initializeApp(firebaseConfig);
} else {
  app = firebase.app();
}

// Initialize auth and firestore
const auth = firebase.auth(app);
const db = firebase.firestore(app);

// Set language for auth
auth.useDeviceLanguage();

// Export getAuth function that always returns the initialized auth instance
const getAuth = () => auth;

export { firebase, getAuth, db };
