import React, { useState, useRef } from "react";
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
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from "react-native-safe-area-context";


const Attendance_fig_cam = () => {
  const navigation = useNavigation();
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [images, setImages] = useState([]);
  const [attendanceLog, setAttendanceLog] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const cameraRef = useRef(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
const API_URL = process.env.EXPO_BASE_URL || 'http://192.168.241.111:3000';

  const authenticateUser = async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return alert("No biometric hardware available");

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return alert("No fingerprints found");

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to mark attendance",
    });

    if (result.success) {
      setLoginSuccess(true);

    } else alert("Authentication failed");
  };

 const takePicture = async () => {
  if (cameraRef.current) {
    const result = await cameraRef.current.takePictureAsync({ quality: 1, base64: true });

    const today = new Date().toDateString();
    const alreadyMarked = attendanceLog.some(
      (entry) => new Date(entry.timestamp).toDateString() === today
    );
    if (alreadyMarked) {
      Alert.alert("Already Marked", "Attendance already marked for today.");
      return;
    }

    try {
      // Send image to backend for face verification
      const formData = new FormData();
      formData.append("image", {
        uri: result.uri,
        type: "image/jpeg",
        name: "attendance.jpg",
      });

      const response = await axios.post(`${API_URL}/verify-face`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data.matched) {
        const timestamp = new Date().toLocaleString();
        const newEntry = {
          uri: result.uri,
          timestamp,
        };

        setImages([...images, newEntry]);
        setAttendanceLog([...attendanceLog, newEntry]);
        setShowModal(true);
        setCameraActive(false);
      } else {
        Alert.alert("Face Not Recognized", "Please try again or contact admin.");
      }
    } catch (error) {
      console.error("Face recognition error:", error);
      Alert.alert("Error", "Failed to verify face. Please try again.");
    }
  }
};


  const openCamera = async () => {
    const { granted } = await requestCameraPermission();
    if (granted) {
      setCameraActive(true);
    } else {
      Alert.alert("Camera Permission Denied", "Cannot open camera without permission.");
    }
  };

  const shareImage = async (uri) => {
    if (!uri) return;
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) await Sharing.shareAsync(uri);
    else alert("Sharing not supported");
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
        {!cameraActive ? <>
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeTitle}>Welcome to Smart Attendance! 👋</Text>
            <Text style={styles.welcomeSubtitle}>
              The easiest way to track your daily attendance with biometric security
            </Text>
          </View>

          <View style={styles.featuresContainer}>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>🔒</Text>
              <Text style={styles.featureText}>Secure biometric authentication</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📸</Text>
              <Text style={styles.featureText}>Photo verification for each check-in</Text>
            </View>
            <View style={styles.featureItem}>
              <Text style={styles.featureIcon}>📅</Text>
              <Text style={styles.featureText}>Automatic date and time tracking</Text>
            </View>
          </View></>
          : <></>
        }



        {loginSuccess ?
          <Text style={styles.successText}>
            ✅ Authentication successful! You can now mark your attendance
          </Text>
          :
          <></>
        }

        <Text style={styles.greetingText}>📅 Today is {currentDate}</Text>

        {!loginSuccess && (
          <View style={{ alignItems: "center" }}>
            <Text style={styles.authPrompt}>
              To get started, authenticate with your fingerprint or face ID
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
              <Text style={styles.lottieButtonText}>Authenticate & Mark Attendance</Text>
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
                  Press the button below to open your camera and mark today's attendance
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
                  Smile! Your photo will be saved with your attendance record
                </Text>
                <Button
                  icon="check"
                  mode="contained"
                  onPress={takePicture}
                  style={styles.captureButton}
                  labelStyle={styles.buttonText}
                >
                  Capture & Mark Attendance
                </Button>
              </>
            )}
          </View>
        )}

        {/* Enhanced Success Modal */}
        <Portal>
          <Modal
            visible={showModal}
            onDismiss={() => setShowModal(false)}
            contentContainerStyle={styles.modalContainer}
          >
            <View style={styles.modalContent}>
              <View style={styles.animationContainer}>
                <LottieView
                  source={require("../../assets/lottie/success.json")}
                  autoPlay
                  loop={false}
                  speed={0.8}
                  style={styles.lottieAnimation}
                />
              </View>

              <View style={styles.textContainer}>
                <Text style={styles.modalTitle}>Attendance Recorded! 🎉</Text>
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
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#4CAF50" />
                    <Text style={styles.detailText}>
                      {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <MaterialCommunityIcons name="camera-account" size={18} color="#4CAF50" />
                    <Text style={styles.detailText}>Photo verified</Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={() => {
                  setShowModal(false);
                  navigation.navigate('StaffHomePage', { refresh: true });
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryButtonText}>Done</Text>
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
    backgroundColor: '#F8F9FA' // match your background color
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
    backgroundColor: "#f8f9fa",
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  featureText: {
    fontSize: 14,
    color: "#34495e",
  },
  greetingText: {
    fontSize: 18,
    fontWeight: "bold",
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
    borderRadius: 150,
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
  modalStyle: {
    backgroundColor: "white",
    padding: 25,
    margin: 30,
    borderRadius: 15,
    alignItems: "center",
  },
  modalTitle: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#2c3e50",
  },
  modalText: {
    textAlign: "center",
    fontSize: 16,
    marginBottom: 20,
    color: "#7f8c8d",
  },
  modalButton: {
    width: "100%",
    backgroundColor: "#3498db",
    borderRadius: 25,
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
    backgroundColor: '#F1F8E9',
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
    backgroundColor: '#F5F5F5',
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
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default Attendance_fig_cam;