import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  TouchableOpacity,
  Button,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../services/Firebase/firebaseConfig';

const MAX_CAPTURES = 5;
const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.7;

export default function FaceCaptureScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState('off');
  const [captureCount, setCaptureCount] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [API_URL, setApiUrl] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  
  const userName = route.params?.userName;
  const email = route.params?.email;

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
            setMessage('API URL not configured. Please contact administrator.');
            setMessageType('error');
          }
        } else {
          setMessage('API configuration not found. Please contact administrator.');
          setMessageType('error');
        }
      } catch (error) {
        console.log('[DEBUG] Error fetching API URL from Firebase:', error);
        setMessage('Failed to fetch API configuration. Please try again later.');
        setMessageType('error');
      }
    };

    fetchApiUrl();
  }, []);

  useEffect(() => {
    // Validate required parameters
    if (!userName || !email) {
      setMessage('Missing user information. Please try again.');
      setMessageType('error');
      navigation.goBack();
      return;
    }
   
    console.log('FaceCapture Screen - UserName:', email);

    // Request camera permission on mount
    const requestCameraAccess = async () => {
      const { granted } = await requestPermission();
      if (!granted) {
        setMessage('Camera access is required to register your face.');
        setMessageType('error');
        navigation.goBack();
      }
    };

    requestCameraAccess();
  }, [email, userName]);

  const captureImage = async () => {
    if (isProcessing || capturedImages.length >= MAX_CAPTURES) return;

    try {
      setIsProcessing(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
        skipProcessing: true,
        exif: false,
      });

      if (!photo.base64) {
        setMessage('Failed to capture image. Please try again.');
        setMessageType('error');
        return;
      }

      const base64Image = `data:image/jpeg;base64,${photo.base64}`;
      
      setCapturedImages(prev => [...prev, base64Image]);
      setCaptureCount(prev => prev + 1);

      if (capturedImages.length + 1 === MAX_CAPTURES) {
        await processFaceTraining([...capturedImages, base64Image]);
      }
    } catch (err) {
      console.error('Capture error:', err);
      setMessage('Failed to capture image. Please try again.');
      setMessageType('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFaceTraining = async (images) => {
    if (!email || !userName) {
      Alert.alert(
        'Error',
        'Missing user information',
        [
          { text: 'Retry', onPress: () => {
            setCapturedImages([]);
            setCaptureCount(0);
          }},
          { text: 'Cancel', onPress: () => navigation.goBack() }
        ]
      );
      return;
    }

    setIsProcessing(true);
    setTrainingProgress(0);
    
    try {
      console.log('Starting face training for:', userName, 'with email:', email);
      
      // Step 1: Save face images
      const saveResponse = await axios.post(`${API_URL}/train_face`, {
        person_name: userName,
        user_mail: email.toLowerCase(),
        images: images
      }, {
        onUploadProgress: progressEvent => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setTrainingProgress(progress);
        }
      });

      if (saveResponse.data.saved_count === 0) {
        throw new Error('No valid faces could be saved');
      }

      // Training is now done in train_face endpoint
      setTrainingProgress(75);

      // Step 3: Verify training
      const verifyResponse = await axios.post(`${API_URL}/verify_training`, {
        user_mail: email.toLowerCase(),
        person_name: userName
      });

      if (!verifyResponse.data.success) {
        throw new Error('Training verification failed');
      }

      setTrainingProgress(100);
      Alert.alert(
        'Success', 
        `Face training completed successfully for ${userName}!`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Training error:', error);
      let errorMessage = error.response?.data?.error || error.message;
      
      Alert.alert(
        'Error',
        errorMessage || 'Failed to complete face training',
        [
          { text: 'Retry', onPress: () => {
            setCapturedImages([]);
            setCaptureCount(0);
          }},
          { text: 'Cancel', onPress: () => navigation.goBack() }
        ]
      );
    } finally {
      setIsProcessing(false);
      setTrainingProgress(0);
    }
  };

  const toggleFlash = () => {
    setFlashMode(current => (current === 'off' ? 'torch' : 'off'));
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera access is required for face registration</Text>
        <Button 
          title="Grant Camera Permission" 
          onPress={requestPermission} 
          color="#6200ee"
        />
        <Button 
          title="Go Back" 
          onPress={() => navigation.goBack()} 
          color="#f44336"
          style={{ marginTop: 10 }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView 
        ref={cameraRef} 
        style={styles.camera} 
        facing="front" 
        flashMode={flashMode}
        enableTorch={flashMode === 'torch'}
      />

      <View style={styles.overlay}>
        <View style={styles.faceCircle} />
        <Text style={styles.instructionText}>
          {captureCount < MAX_CAPTURES 
            ? `Align your face in the circle (${captureCount}/${MAX_CAPTURES})`
            : 'Processing your face data...'}
        </Text>
        
        {trainingProgress > 0 && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Training progress: {trainingProgress}%
            </Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${trainingProgress}%` }]} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
          <MaterialIcons 
            name={flashMode === 'off' ? 'flash-off' : 'flash-on'} 
            size={28} 
            color="white" 
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.captureButton,
            (isProcessing || captureCount >= MAX_CAPTURES) && styles.disabledButton
          ]}
          onPress={captureImage}
          disabled={isProcessing || captureCount >= MAX_CAPTURES}
        >
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>

        <View style={styles.flashButton} />
      </View>

      {isProcessing && (
        <View style={styles.processingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.processingText}>
            {captureCount < MAX_CAPTURES 
              ? 'Processing image...' 
              : 'Training your facial data...'}
          </Text>
        </View>
      )}

      {message && (
        <View style={[styles.message, messageType === 'error' && styles.error, messageType === 'success' && styles.success]}>
          {message}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: '20%',
    width: '100%',
    alignItems: 'center',
  },
  faceCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 170, 0.7)',
    backgroundColor: 'transparent',
  },
  instructionText: {
    marginTop: 20,
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 20,
    fontWeight: '500',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 40,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  disabledButton: {
    opacity: 0.5,
  },
  flashButton: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  processingText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  permissionText: {
    fontSize: 18,
    marginBottom: 20,
    textAlign: 'center',
  },
  progressContainer: {
    marginTop: 20,
    width: '80%',
  },
  progressText: {
    color: '#fff',
    fontSize: 14,
    marginBottom: 5,
    textAlign: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00FFAA',
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
    position: 'absolute',
    top: 40,
    left: 20,
    right: 20,
    zIndex: 100,
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
});