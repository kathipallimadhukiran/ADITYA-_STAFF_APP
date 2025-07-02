import React, { useState, useRef, useEffect } from "react";
import axios from 'axios';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { Button, Text, Modal, Portal, Provider } from "react-native-paper";
import * as LocalAuthentication from "expo-local-authentication";
import * as Sharing from "expo-sharing";
import { useCameraPermissions, CameraView } from "expo-camera";
import LottieView from "lottie-react-native";
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from "react-native-safe-area-context";
import { getAuth, db } from "../../services/Firebase/firebaseConfig";
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Helper function to get week number
const getWeekNumber = (date) => {
  // Copy date so don't modify original
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

const Attendance_fig_cam = () => {
  console.log('[DEBUG] Attendance_fig_cam: Component mounted');
  
  const navigation = useNavigation();
  const route = useRoute();
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [images, setImages] = useState([]);
  const [attendanceLog, setAttendanceLog] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [userData, setUserData] = useState(route.params?.userData || null);
  const [cameraError, setCameraError] = useState(null);
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [API_URL, setApiUrl] = useState(null);
  const [attendanceSettings, setAttendanceSettings] = useState({
    startTime: '09:00',
    endTime: '17:00',
    lateMarkingTime: '09:30',
    autoAbsentTime: '23:15',
    relaxationTime: '15',
    workingDays: {
      Sunday: false,
      Monday: true,
      Tuesday: true,
      Wednesday: true,
      Thursday: true,
      Friday: true,
      Saturday: false,
    },
    holidays: []
  });

  // Add effect to fetch API URL from Firebase
  useEffect(() => {
    const fetchApiUrl = async () => {
      try {
        const settingsDoc = await db.collection('settings').doc('api_config').get();
        if (settingsDoc.exists) {
          const { api_url } = settingsDoc.data();
          if (api_url) {
            console.log('[DEBUG] Using API URL from Firebase:', api_url);
            setApiUrl(api_url);
          } else {
            Alert.alert(
              "Configuration Error",
              "API URL not configured. Please contact administrator."
            );
          }
        } else {
          Alert.alert(
            "Configuration Error",
            "API configuration not found. Please contact administrator."
          );
        }
      } catch (error) {
        console.log('[DEBUG] Error fetching API URL from Firebase:', error);
        Alert.alert(
          "Connection Error",
          "Failed to fetch API configuration. Please try again later."
        );
      }
    };

    fetchApiUrl();
  }, []);

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // If we already have userData from navigation params, use that
        if (route.params?.userData) {
          console.log('[DEBUG] Using userData from params:', route.params.userData);
          setUserData({
            ...route.params.userData,
            id: route.params.userId || route.params.userData.email?.toLowerCase()
          });
          return;
        }

        const auth = getAuth();
        if (!auth) {
          console.error("[DEBUG] Auth not initialized");
          navigation.navigate('Login');
          return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
          console.error("[DEBUG] No user logged in");
          navigation.navigate('Login');
          return;
        }

        console.log("[DEBUG] Current user ID:", currentUser.uid);
        console.log("[DEBUG] Making API request to:", `${API_URL}/get_current_user?user_id=${currentUser.uid}`);

        const response = await axios.get(`${API_URL}/get_current_user?user_id=${currentUser.uid}`);
        console.log("[DEBUG] API Response:", response.data);
        
        if (response.data.success && response.data.user) {
          const newUserData = {
            ...response.data.user,
            id: currentUser.uid
          };
          console.log("[DEBUG] Setting user data:", newUserData);
          setUserData(newUserData);
          
          if (!response.data.user.has_face_data) {
            showRegistrationAlert();
          }
        } else {
          console.error("[DEBUG] Failed to fetch user data:", response.data.error);
          showRegistrationAlert();
        }
      } catch (error) {
        console.error("[DEBUG] Error fetching user data:", error);
        if (error.response?.status === 404) {
          showRegistrationAlert();
        } else {
          Alert.alert(
            "Connection Error",
            "Failed to connect to the server. Please check your connection and try again."
          );
        }
      }
    };

    fetchUserData();
  }, [route.params]);

  // Add this effect to load attendance settings
  useEffect(() => {
    const loadAttendanceSettings = async () => {
      try {
        const doc = await db.collection('settings').doc('attendance').get();
        if (doc.exists) {
          setAttendanceSettings(doc.data());
        }
      } catch (error) {
        console.error('[DEBUG] Error loading attendance settings:', error);
      }
    };

    loadAttendanceSettings();
  }, []);

  // Add cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup camera when component unmounts
      if (cameraRef.current) {
        console.log('[DEBUG] Cleaning up camera resources');
        setCameraActive(false);
        cameraRef.current = null;
      }
    };
  }, []);

  // Add camera error reset when cameraActive changes
  useEffect(() => {
    if (!cameraActive) {
      setCameraError(null);
    }
  }, [cameraActive]);

  const showRegistrationAlert = () => {
    Alert.alert(
      "Face Registration Required",
      "You need to complete face registration before using attendance features. Would you like to register now?",
      [
        {
          text: "Register Now",
          onPress: () => {
            console.log("Navigating to FaceCaptureScreen with data:", {
              userId: userData?.id || route.params?.userId,
              userName: userData?.name || route.params?.userName,
              email: userData?.email || route.params?.email,
              userData: userData || route.params?.userData
            });
            
            // Reset camera state
            setCameraActive(false);
            setProcessing(false);
            
            // Navigate to FaceCaptureScreen
            navigation.navigate("FaceCaptureScreen", {
              userId: userData?.email?.toLowerCase(), // Use email as userId for consistency
              userName: userData?.name,
              email: userData?.email?.toLowerCase(),
              userData: {
                ...userData,
                email: userData?.email?.toLowerCase(),
                id: userData?.email?.toLowerCase()
              }
            });
          },
          style: "default"
        },
        {
          text: "Later",
          onPress: () => {
            setCameraActive(false);
            setProcessing(false);
            navigation.goBack();
          },
          style: "cancel"
        }
      ],
      { cancelable: false }
    );
  };

  const authenticateUser = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) return alert("No biometric hardware available");

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) return alert("No biometric credentials found");

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate to mark attendance",
      });

      if (result.success) {
        setLoginSuccess(true);
      } else {
        Alert.alert("Authentication Failed", "Biometric authentication failed. Please try again.");
      }
    } catch (error) {
      console.error("Authentication error:", error);
      Alert.alert("Error", "An error occurred during authentication");
    }
  };

  const openCamera = async () => {
    try {
      console.log('[DEBUG] Attempting to open camera');
      // Reset any previous camera errors
      setCameraError(null);
      
      // Reset camera state
      if (cameraRef.current) {
        cameraRef.current = null;
      }

      // Get current time
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
      
      // Get current day
      const currentDay = now.toLocaleString('default', { weekday: 'long' });
      
      // Get attendance settings
      const settingsDoc = await db.collection('settings').doc('attendance').get();
      if (!settingsDoc.exists) {
        Alert.alert("Error", "Attendance settings not found");
        return;
      }
      
      const settings = settingsDoc.data();
      const daySettings = settings.workingDays[currentDay];
      
      if (!daySettings || !daySettings.isWorking) {
        Alert.alert(
          "Session Not Started",
          `Attendance cannot be marked on ${currentDay} as it is not a working day.`
        );
        return;
      }
      
      // Check if it's a holiday
      const todayStr = now.toISOString().split('T')[0];
      const isHoliday = settings.holidays.some(holiday => holiday.date === todayStr);
      if (isHoliday) {
        const holiday = settings.holidays.find(h => h.date === todayStr);
        Alert.alert(
          "Holiday",
          `Today is a holiday: ${holiday.description}`
        );
        return;
      }
      
      // Parse start time
      const [startHour, startMinute] = daySettings.startTime.split(':').map(Number);
      
      // Check if current time is before start time
      if (currentHour < startHour || (currentHour === startHour && currentMinute < startMinute)) {
        Alert.alert(
          "Session Not Started",
          `Attendance marking starts at ${daySettings.startTime}. Please try again later.`
        );
        return;
      }

      // If all checks pass, request camera permission
      const { granted } = await requestCameraPermission();
      if (granted) {
        console.log('[DEBUG] Camera permission granted, activating camera');
        setCameraActive(true);
      } else {
        console.log('[DEBUG] Camera permission denied');
        Alert.alert(
          "Camera Permission Denied", 
          "Please enable camera permissions in settings to mark attendance."
        );
      }
    } catch (error) {
      console.error("[DEBUG] Error in openCamera:", error);
      setCameraError(error.message);
      Alert.alert(
        "Error",
        "Failed to open camera. Please try again."
      );
    }
  };

  const takePicture = async () => {
    if (!API_URL) {
      Alert.alert(
        "Configuration Error",
        "API URL not configured. Please contact administrator."
      );
      return;
    }
    
    if (!cameraRef.current) {
      console.error("[DEBUG] Camera ref not available");
      // Reset camera state and try to reinitialize
      setCameraActive(false);
      setTimeout(() => {
        openCamera();
      }, 500);
      return;
    }
    
    try {
      setProcessing(true);
      // Check current time and session status again before taking picture
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentDay = now.toLocaleString('default', { weekday: 'long' });
      
      const settingsDoc = await db.collection('settings').doc('attendance').get();
      if (!settingsDoc.exists) {
        throw new Error("Attendance settings not found");
      }
      
      const settings = settingsDoc.data();
      const daySettings = settings.workingDays[currentDay];
      
      if (!daySettings || !daySettings.isWorking) {
        throw new Error(`Attendance cannot be marked on ${currentDay} as it is not a working day.`);
      }
      
      // Check if it's a holiday
      const todayStr = now.toISOString().split('T')[0];
      const isHoliday = settings.holidays.some(holiday => holiday.date === todayStr);
      if (isHoliday) {
        const holiday = settings.holidays.find(h => h.date === todayStr);
        throw new Error(`Today is a holiday: ${holiday.description}`);
      }
      
      // Parse start time
      const [startHour, startMinute] = daySettings.startTime.split(':').map(Number);
      
      // Check if current time is before start time
      if (currentHour < startHour || (currentHour === startHour && currentMinute < startMinute)) {
        throw new Error(`Attendance marking starts at ${daySettings.startTime}. Please try again later.`);
      }
      
      if (!userData?.email) {
        console.error("No user email available");
        showRegistrationAlert();
        return;
      }
      
      const result = await cameraRef.current.takePictureAsync({ 
        quality: 0.8, 
        base64: true,
        exif: false
      });

      // Check if attendance already marked today
      const today = new Date().toDateString();
      const alreadyMarked = attendanceLog.some(
        (entry) => new Date(entry.timestamp).toDateString() === today
      );
      
      if (alreadyMarked) {
        Alert.alert("Already Marked", "Attendance already marked for today.");
        setProcessing(false);
        return;
      }

      // Format image data as base64
      const imageData = `data:image/jpeg;base64,${result.base64}`;

      console.log("Sending face recognition request with data:", {
        email: userData.email,
        name: userData.name,
        imageSize: imageData.length
      });

      const response = await axios.post(`${API_URL}/recognize_face`, {
        image: imageData,
        person_name: userData.name,
        user_mail: userData.email?.toLowerCase() // Change user_id to user_mail to match API expectation
      });

      console.log("Face recognition response:", response.data);
      
      if (response.data.success) {
        if (response.data.needs_registration) {
          showRegistrationAlert();
          return;
        }

        const timestamp = new Date().toLocaleString();
        const newEntry = {
          uri: result.uri,
          timestamp,
          verificationData: response.data,
          status: response.data.verified ? 'Present' : 'Unverified'
        };

        setImages([...images, newEntry]);
        setAttendanceLog([...attendanceLog, newEntry]);
        
        // Add email to verification data
        const verificationDataWithEmail = {
          ...response.data,
          email: userData.email?.toLowerCase()
        };
        
        setVerificationResult(verificationDataWithEmail);
        setShowModal(true);
        setCameraActive(false);
        
        // If verified, mark attendance in backend with email included
        if (response.data.verified) {
          await markAttendanceInBackend(verificationDataWithEmail);
        }
      } else {
        if (response.data.needs_registration) {
          showRegistrationAlert();
        } else {
          showVerificationError(response.data.error || "Face verification failed");
        }
      }
    } catch (error) {
      console.error("Face recognition error:", error);
      let errorMessage = "Failed to verify face. Please try again.";
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      if (error.response?.data?.needs_registration) {
        showRegistrationAlert();
      } else {
        showVerificationError(errorMessage);
      }
      
      // Reset camera state on error
      setCameraActive(false);
      cameraRef.current = null;
    } finally {
      setProcessing(false);
    }
  };

  const showVerificationError = (message) => {
    Alert.alert(
      "Verification Failed",
      message,
      [
        { text: "Try Again", onPress: () => setProcessing(false) },
        { 
          text: "Cancel", 
          onPress: () => {
            setProcessing(false);
            setCameraActive(false);
          }
        },
      ]
    );
  };

  const markAttendanceInBackend = async (verificationData) => {
    try {
      if (!verificationData?.email) {
        throw new Error('Email is required for marking attendance');
      }

      const email = verificationData.email.toLowerCase();
      
      // Store email in AsyncStorage
      await AsyncStorage.setItem('userEmail', email);
      
      const timestamp = new Date();
      const year = timestamp.getFullYear().toString();
      const monthName = timestamp.toLocaleString('default', { month: 'long' });
      const date = timestamp.getDate().toString();
      const dayName = timestamp.toLocaleString('default', { weekday: 'long' });
      const weekNumber = getWeekNumber(timestamp);
      const attendanceId = `${date}-${monthName}-${year}`;

      console.log('[DEBUG] Marking attendance for:', email);

      // Get the latest attendance settings
      const settingsDoc = await db.collection('settings').doc('attendance').get();
      if (!settingsDoc.exists) {
        throw new Error('Attendance settings not found');
      }
      const settings = settingsDoc.data();

      // Get day-specific settings
      const daySettings = settings.workingDays[dayName];
      if (!daySettings || !daySettings.isWorking) {
        throw new Error(`Attendance cannot be marked on ${dayName} as it is not a working day`);
      }

      // Check if it's a holiday
      const todayStr = timestamp.toISOString().split('T')[0];
      const isHoliday = settings.holidays.some(holiday => holiday.date === todayStr);
      if (isHoliday) {
        const holiday = settings.holidays.find(h => h.date === todayStr);
        throw new Error(`Today is a holiday: ${holiday.description}`);
      }

      // Get current time in HH:mm format
      const currentHour = timestamp.getHours();
      const currentMinute = timestamp.getMinutes();
      const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;

      // Parse time settings for the day
      const [startHour, startMinute] = daySettings.startTime.split(':').map(Number);
      const [endHour, endMinute] = daySettings.endTime.split(':').map(Number);
      const [lateHour, lateMinute] = daySettings.lateMarkingTime.split(':').map(Number);
      const [absentHour, absentMinute] = daySettings.autoAbsentTime.split(':').map(Number);

      // Initialize attendance status variables
      let attendanceStatus = 'Present';
      let isLate = false;

      // Check if current time is before start time
      if (currentHour < startHour || (currentHour === startHour && currentMinute < startMinute)) {
        throw new Error(`Attendance marking starts at ${daySettings.startTime}`);
      }

      // Check if current time is after end time
      if (currentHour > endHour || (currentHour === endHour && currentMinute > endMinute)) {
        throw new Error(`Attendance marking ends at ${daySettings.endTime}`);
      }

      // Check if current time is after auto absent time
      if (currentHour > absentHour || (currentHour === absentHour && currentMinute > absentMinute)) {
        // Instead of throwing error, mark as absent
        attendanceStatus = 'Absent';
        isLate = true;
      } else if (currentHour > lateHour || (currentHour === lateHour && currentMinute > lateMinute)) {
        isLate = true;
        attendanceStatus = 'Late';
      }

      // Get user data
      const userDoc = await db.collection('users').doc(email).get();
      if (!userDoc.exists) {
        throw new Error('User document not found');
      }

      const userData = userDoc.data();
      console.log('[DEBUG] User data retrieved:', userData);

      // Default to 'staff' if role is undefined
      const userRole = (userData?.role || 'staff').toLowerCase();

      // Create attendance record with improved structure
      const attendanceData = {
        // User Information
        userId: email,
        userName: userData?.name || verificationData.person,
        userRole: userRole,
        
        // Attendance Status
        status: attendanceStatus,
        verificationStatus: verificationData.verified ? 'Verified' : 'Unverified',
        confidence: verificationData.confidence,
        isLate: isLate,
        
        // Time Information
        timestamp: timestamp,
        timeStr: currentTime,
        dateStr: timestamp.toLocaleDateString(),
        
        // Date Components
        year: year,
        month: monthName,
        monthNumber: timestamp.getMonth() + 1,
        date: parseInt(date),
        dayName: dayName,
        dayOfWeek: timestamp.getDay(),
        weekNumber: weekNumber,
        
        // Settings Used
        daySettings: {
          startTime: daySettings.startTime,
          endTime: daySettings.endTime,
          lateMarkingTime: daySettings.lateMarkingTime,
          autoAbsentTime: daySettings.autoAbsentTime,
          relaxationTime: daySettings.relaxationTime
        },
        
        // Metadata
        createdAt: timestamp,
        lastUpdated: timestamp,
        deviceInfo: {
          timestamp: timestamp.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }
      };

      console.log('[DEBUG] Attendance data prepared:', attendanceData);

      // Save in daily attendance
      const dailyAttendanceRef = db
        .collection('daily_attendance')
        .doc(year)
        .collection(monthName)
        .doc(`${dayName}_${date}`)
        .collection('records')
        .doc(email);

      // Save in user's attendance history
      const userAttendanceRef = db
        .collection('user_attendance')
        .doc(email)
        .collection(year)
        .doc(monthName)
        .collection('records')
        .doc(attendanceId);

      // Save the attendance record in both locations
      await Promise.all([
        dailyAttendanceRef.set(attendanceData, { merge: true }),
        userAttendanceRef.set(attendanceData, { merge: true })
      ]);

      console.log('[DEBUG] Attendance marked successfully in both systems');

      // Show appropriate message based on attendance status
      if (attendanceStatus === 'Absent') {
        Alert.alert(
          "Auto Absent",
          `Your attendance has been marked as absent since it's after ${daySettings.autoAbsentTime}.`
        );
      } else if (isLate) {
        Alert.alert(
          "Late Attendance",
          `Your attendance has been marked as late. Late marking time is ${daySettings.lateMarkingTime}.`
        );
      } else {
        Alert.alert(
          "Success",
          "Your attendance has been marked successfully!"
        );
      }

      // Navigate based on role
      const dashboardScreen = userRole === 'admin' ? 'AdminDashboard' : 'StaffDashboard';
      navigation.navigate(dashboardScreen, { 
        refresh: true,
        attendanceMarked: true 
      });

    } catch (error) {
      console.error('[DEBUG] Error marking attendance:', error);
      Alert.alert(
        "Error",
        error.message || "Failed to mark attendance. Please try again."
      );
      throw error;
    }
  };

  const getCurrentAcademicYear = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    
    if (month >= 6) {
      return `${year}-${year + 1}`;
    }
    return `${year - 1}-${year}`;
  };

  const shareImage = async (uri) => {
    if (!uri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) await Sharing.shareAsync(uri);
    else alert("Sharing not available on this device");
  };

  const currentDate = new Date().toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const getStatusColor = () => {
    if (!verificationResult) return "#FFC107";
    return verificationResult.verified ? "#4CAF50" : "#FF5722";
  };

  const getStatusIcon = () => {
    if (!verificationResult) return "alert-circle";
    return verificationResult.verified ? "check-circle" : "alert-circle";
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Provider>
        <ScrollView
          contentContainerStyle={{
            marginTop: 20,
            flexGrow: 1,
            alignItems: "center",
            paddingBottom: 30,
          }}
        >
          {!cameraActive ? (
            <>
              <View style={styles.welcomeContainer}>
                <Text style={styles.welcomeTitle}>Welcome to Smart Attendance! 👋</Text>
                <Text style={styles.welcomeSubtitle}>
                  Secure biometric attendance system with facial verification
                </Text>
              </View>

              <View style={styles.featuresContainer}>
                <View style={styles.featureItem}>
                  <Ionicons name="finger-print" size={20} color="#3498db" />
                  <Text style={styles.featureText}>Biometric Authentication</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="camera" size={20} color="#3498db" />
                  <Text style={styles.featureText}>Facial Verification</Text>
                </View>
                <View style={styles.featureItem}>
                  <Ionicons name="time" size={20} color="#3498db" />
                  <Text style={styles.featureText}>24/7 Attendance Marking</Text>
                </View>
              </View>
            </>
          ) : null}

          {loginSuccess && (
            <Text style={styles.successText}>
              ✅ Authentication successful! You can now mark your attendance
            </Text>
          )}

          <Text style={styles.greetingText}>
            <Ionicons name="calendar" size={18} color="#3498db" /> {currentDate}
          </Text>

          {!loginSuccess && (
            <View style={{ alignItems: "center" }}>
              <Text style={styles.authPrompt}>
                Authenticate with biometrics to mark your attendance
              </Text>
              <TouchableOpacity
                style={styles.lottieButton}
                onPress={authenticateUser}
                activeOpacity={0.7}
              >
                <LottieView
                  source={require("../../assets/lottie/fingerprint.json")}
                  autoPlay
                  loop
                  speed={0.6}
                  style={{ width: 200, height: 200 }}
                />
                <Text style={styles.lottieButtonText}>Authenticate Now</Text>
              </TouchableOpacity>
            </View>
          )}

          {loginSuccess && (
            <View style={styles.cameraContainer}>
              {!cameraActive ? (
                <>
                  <LottieView
                    source={require("../../assets/lottie/camera.json")}
                    autoPlay
                    loop
                    style={{ width: 300, height: 300, marginTop: 10 }}
                  />
                  <Text style={styles.instructionText}>
                    Open camera to mark today's attendance with facial verification
                  </Text>
                  {cameraError && (
                    <Text style={styles.errorText}>
                      Error: {cameraError}. Please try again.
                    </Text>
                  )}
                  <Button
                    icon="camera"
                    mode="contained"
                    onPress={openCamera}
                    style={styles.captureButton}
                    labelStyle={styles.buttonText}
                  >
                    Open Camera
                  </Button>
                </>
              ) : (
                <>
                  <CameraView
                    style={styles.camera}
                    facing="front"
                    ref={cameraRef}
                    onError={(error) => {
                      console.error('[DEBUG] Camera error:', error);
                      setCameraError(error.message);
                      setCameraActive(false);
                    }}
                  />
                  <Text style={styles.instructionText}>
                    Position your face in the frame and smile for verification
                  </Text>
                  <Button
                    icon="check"
                    mode="contained"
                    onPress={takePicture}
                    style={styles.captureButton}
                    labelStyle={styles.buttonText}
                    loading={processing}
                    disabled={processing}
                  >
                    {processing ? "Processing..." : "Capture & Verify"}
                  </Button>
                </>
              )}
            </View>
          )}

          {/* Enhanced Verification Modal */}
          <Portal>
            <Modal
              visible={showModal}
              onDismiss={() => setShowModal(false)}
              contentContainerStyle={styles.modalContainer}
            >
              <View style={styles.modalContent}>
                <View style={[
                  styles.animationContainer,
                  { backgroundColor: verificationResult?.verified ? '#E8F5E9' : '#FFF8E1' }
                ]}>
                  <LottieView
                    source={verificationResult?.verified 
                      ? require("../../assets/lottie/success.json")
                      : require("../../assets/lottie/fingerprint.json")}
                    autoPlay
                    loop={false}
                    speed={0.8}
                    style={styles.lottieAnimation}
                  />
                </View>

                <View style={styles.textContainer}>
                  <Text style={styles.modalTitle}>
                    {verificationResult?.verified 
                      ? "Attendance Verified! 🎉" 
                      : "Verification Needed ⚠️"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>

                  <View style={styles.detailsContainer}>
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="clock-outline" size={18} color="#616161" />
                      <Text style={styles.detailText}>
                        {new Date().toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit',
                          hour12: false 
                        })}
                      </Text>
                    </View>
                    
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons 
                        name={getStatusIcon()} 
                        size={18} 
                        color={getStatusColor()} 
                      />
                      <Text style={[styles.detailText, { color: getStatusColor() }]}>
                        Status: {verificationResult?.verified ? "Verified Present" : "Not Verified"}
                      </Text>
                    </View>
                    
                    {verificationResult?.person && (
                      <View style={styles.detailRow}>
                        <MaterialCommunityIcons name="account" size={18} color="#616161" />
                        <Text style={styles.detailText}>
                          Identity: {verificationResult.person}
                        </Text>
                      </View>
                    )}
                    
                    <View style={styles.detailRow}>
                      <MaterialCommunityIcons name="security" size={18} color="#616161" />
                      <Text style={styles.detailText}>
                        Confidence: {verificationResult?.confidence?.toFixed(2) || "0"}%
                      </Text>
                    </View>
                  </View>
                </View>

                <TouchableOpacity
                  style={[
                    styles.primaryButton, 
                    { backgroundColor: getStatusColor() }
                  ]}
                  onPress={() => {
                    setShowModal(false);
                    const dashboardScreen = 
                      userData?.role?.toLowerCase() === 'admin' ? 'AdminDashboard' :
                      userData?.role?.toLowerCase() === 'student' ? 'StudentDashboard' : 
                      'StaffDashboard';
                    navigation.navigate(dashboardScreen, { refresh: true });
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.primaryButtonText}>
                    {verificationResult?.verified ? "Done" : "Acknowledge"}
                  </Text>
                </TouchableOpacity>
              </View>
            </Modal>
          </Portal>
        </ScrollView>
      </Provider>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8F9FA'
  },
  welcomeContainer: {
    alignItems: "center",
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
    color: "#2c3e50",
  },
  welcomeSubtitle: {
    fontSize: 16,
    textAlign: "center",
    color: "#7f8c8d",
    marginBottom: 20,
  },
  featuresContainer: {
    width: "90%",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  featureText: {
    fontSize: 14,
    color: "#34495e",
    marginLeft: 10,
  },
  greetingText: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
    marginTop: 10,
    color: "#3498db",
  },
  authPrompt: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 15,
    color: "#7f8c8d",
    paddingHorizontal: 20,
  },
  successText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 15,
    color: "#27ae60",
    paddingHorizontal: 20,
  },
  instructionText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    color: "#7f8c8d",
    paddingHorizontal: 20,
  },
  cameraContainer: {
    justifyContent: "center",
    alignItems: "center"
  },
  camera: {
    width: 300,
    height: 300,
    borderRadius: 10,
    overflow: "hidden",
    marginTop: 10,
    marginBottom: 15,
  },
  captureButton: {
    marginTop: 10,
    backgroundColor: "#3498db",
    borderRadius: 25,
    paddingVertical: 5,
  },
  buttonText: {
    color: "white",
    fontSize: 16,
  },
  lottieButton: {
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  lottieButtonText: {
    color: "#3498db",
    fontSize: 16,
    marginTop: -30,
    fontWeight: "bold",
  },
  modalContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    width: '100%',
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  animationContainer: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  lottieAnimation: {
    width: 150,
    height: 150,
  },
  textContainer: {
    padding: 25,
    paddingBottom: 15,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 5,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
  },
  detailsContainer: {
    width: '100%',
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#424242',
  },
  primaryButton: {
    padding: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  errorText: {
    color: '#FF5722',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
});

export default Attendance_fig_cam;