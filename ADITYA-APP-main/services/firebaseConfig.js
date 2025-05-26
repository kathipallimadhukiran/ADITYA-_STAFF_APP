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

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
  firebase.auth().useDeviceLanguage();
}

const auth = firebase.auth();       // <-- ADD THIS
const db = firebase.firestore();

export { firebase, auth, db };       // <-- EXPORT auth as well
