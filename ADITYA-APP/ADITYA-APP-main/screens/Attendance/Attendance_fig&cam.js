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

const Attendance_fig_cam = () => {
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
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const API_URL = 'http://192.168.29.44:5000';

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // If we already have userData from navigation params, use that
        if (route.params?.userData) {
          setUserData({
            ...route.params.userData,
            id: route.params.userId || route.params.userData.email?.toLowerCase()
          });
          return;
        }

        const auth = getAuth();
        if (!auth) {
          console.error("Auth not initialized");
          navigation.navigate('Login');
          return;
        }

        const currentUser = auth.currentUser;
        if (!currentUser?.uid) {
          console.error("No user logged in");
          navigation.navigate('Login');
          return;
        }

        console.log("Current user ID:", currentUser.uid);

        const response = await axios.get(`${API_URL}/get_current_user?user_id=${currentUser.uid}`);
        
        if (response.data.success && response.data.user) {
          setUserData({
            ...response.data.user,
            id: currentUser.uid
          });
          
          if (!response.data.user.has_face_data) {
            showRegistrationAlert();
          }
        } else {
          console.error("Failed to fetch user data:", response.data.error);
          showRegistrationAlert();
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
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

  const showRegistrationAlert = () => {
    Alert.alert(
      "Face Registration Required",
      "You need to complete face registration before using attendance features. Would you like to register now?",
      [
        {
          text: "Register Now",
          onPress: () => navigation.navigate("FaceCaptureScreen", {
            userId: userData?.id || route.params?.userId,
            userName: userData?.name || route.params?.userName,
            email: userData?.email || route.params?.email,
            userData: userData || route.params?.userData
          }),
          style: "default"
        },
        {
          text: "Later",
          onPress: () => {
            setCameraActive(false);
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

  const takePicture = async () => {
    if (!cameraRef.current) return;
    
    if (!userData?.id) {
      showRegistrationAlert();
      return;
    }
    
    setProcessing(true);
    try {
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

      console.log("Sending face recognition request...");
      const response = await axios.post(`${API_URL}/recognize_face`, {
        image: imageData,
        person_name: userData.name,
        user_id: userData.id
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
        setVerificationResult(response.data);
        setShowModal(true);
        setCameraActive(false);
        
        // If verified, mark attendance in backend
        if (response.data.verified) {
          await markAttendanceInBackend(response.data);
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
      // First mark attendance in Flask backend
      await axios.post(`${API_URL}/mark_attendance`, {
        user_id: userData?.id,
        person_name: verificationData.person,
        timestamp: new Date().toISOString(),
        status: 'Present',
        confidence: verificationData.confidence,
        verification_data: verificationData
      });

      // Then save to Firebase
      const attendanceRef = db.collection('attendance').doc();
      const timestamp = new Date();
      
      await attendanceRef.set({
        userId: userData?.id,
        userName: userData?.name,
        date: timestamp,
        status: 'Present',
        confidence: verificationData.confidence,
        verificationData: {
          ...verificationData,
          timestamp: timestamp.toISOString()
        },
        createdAt: timestamp,
        academicYear: getCurrentAcademicYear(),
        month: timestamp.getMonth() + 1,
        day: timestamp.getDate(),
        dayOfWeek: timestamp.getDay()
      });

      console.log("Attendance marked successfully in both systems");
    } catch (error) {
      console.error("Error marking attendance:", error);
      Alert.alert(
        "Attendance Error",
        "There was an error marking your attendance. Please try again."
      );
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

  const openCamera = async () => {
    const { granted } = await requestCameraPermission();
    if (granted) {
      setCameraActive(true);
    } else {
      Alert.alert(
        "Camera Permission Denied", 
        "Please enable camera permissions in settings to mark attendance."
      );
    }
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
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
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
                        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
                    navigation.navigate('Dashboard', { refresh: true });
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
});

export default Attendance_fig_cam;