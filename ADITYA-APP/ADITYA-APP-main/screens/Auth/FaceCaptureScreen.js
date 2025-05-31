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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import axios from 'axios';
import { MaterialIcons } from '@expo/vector-icons';

const MAX_CAPTURES = 5;
const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.7;
const API_URL = 'http://192.168.29.44:5000'; // Update with your server IP

export default function FaceCaptureScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState('off');
  const [captureCount, setCaptureCount] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);
  
  // Get userId and userName from route params
  const userId = route.params?.userId;
  const userName = route.params?.userName;

  useEffect(() => {
    // Validate required parameters
    if (!userId || !userName) {
      Alert.alert(
        'Missing Information',
        'User ID or Name is missing',
        [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]
      );
    }
    console.log('FaceCapture Screen - UserID:', userId);
    console.log('FaceCapture Screen - UserName:', userName);
  }, [userId, userName]);

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

      if (!photo.base64) throw new Error('No image data received');

      const base64Image = `data:image/jpeg;base64,${photo.base64}`;
      
      setCapturedImages(prev => [...prev, base64Image]);
      setCaptureCount(prev => prev + 1);

      if (capturedImages.length + 1 === MAX_CAPTURES) {
        await processFaceTraining([...capturedImages, base64Image]);
      }
    } catch (err) {
      console.error('Capture error:', err);
      Alert.alert('Error', 'Failed to capture image');
    } finally {
      setIsProcessing(false);
    }
  };

  const processFaceTraining = async (images) => {
    if (!userId || !userName) {
      Alert.alert('Error', 'Missing user information');
      return;
    }

    setIsProcessing(true);
    setTrainingProgress(0);
    
    try {
      console.log('Starting face training for:', userName, 'with ID:', userId);
      
      // Step 1: Save face images
      const saveResponse = await axios.post(`${API_URL}/train_face`, {
        person_name: userName,
        user_id: userId,
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

      // Step 2: Train model
      setTrainingProgress(50);
      const trainResponse = await axios.post(`${API_URL}/train_model`);
      if (trainResponse.data.message !== 'Training complete') {
        throw new Error('Model training failed');
      }

      // Step 3: Verify training
      setTrainingProgress(75);
      const verifyResponse = await axios.post(`${API_URL}/verify_training`, {
        user_id: userId,
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

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permissionText}>Camera access is required</Text>
        <Button 
          title="Grant Permission" 
          onPress={requestPermission} 
          color="#6200ee"
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
});