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
  AppState,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { Camera } from 'expo-camera';
import axios from 'axios';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../../services/Firebase/firebaseConfig';

const MAX_CAPTURES = 5;
const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.7;

export default function FaceCaptureScreen({ navigation, route }) {
  const cameraRef = useRef(null);
  const isMounted = useRef(true);
  const [permission, setPermission] = useState(null);
  const [capturedImages, setCapturedImages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [flashMode, setFlashMode] = useState('off');
  const [captureCount, setCaptureCount] = useState(0);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [API_URL, setApiUrl] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [networkStatus, setNetworkStatus] = useState('checking'); // 'checking', 'connected', 'disconnected'
  const [appState, setAppState] = useState(AppState.currentState);
  const [cameraKey, setCameraKey] = useState(0); // For remounting CameraView
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  
  const userName = route.params?.userName;
  const email = route.params?.email;

  // Create axios instance with better configuration
  const createAxiosInstance = (baseURL) => {
    return axios.create({
      baseURL,
      timeout: 30000, // 30 seconds timeout for training
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });
  };

  // Test server connectivity
  const testServerConnectivity = async () => {
    if (!API_URL) return false;
    
    try {
      const axiosInstance = createAxiosInstance(API_URL);
      console.log('[DEBUG] Testing connectivity to:', API_URL);
      
      // Try a basic connectivity test to the root path
      const response = await axiosInstance.get('/', { timeout: 5000 });
      console.log('[DEBUG] Server connectivity test successful:', response.status);
      setNetworkStatus('connected');
      return true;
    } catch (error) {
      // If we get a 404, it means the server is running but the endpoint doesn't exist
      // This is still considered "connected" for our purposes
      if (error.response?.status === 404) {
        console.log('[DEBUG] Server is running but endpoint not found - considering connected');
        setNetworkStatus('connected');
        return true;
      }
      
      // Only log as error if it's not a 404
      console.error('[DEBUG] Server connectivity test failed:', error.message);
      setNetworkStatus('disconnected');
      return false;
    }
  };

  // Check network connectivity on mount and when API_URL changes
  useEffect(() => {
    if (API_URL) {
      testServerConnectivity();
    }
  }, [API_URL]);

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
      const { status } = await Camera.requestCameraPermissionsAsync();
      setPermission(status === 'granted');
      if (status !== 'granted') {
        setMessage('Camera access is required to register your face.');
        setMessageType('error');
        navigation.goBack();
      }
    };

    requestCameraAccess();
  }, [email, userName]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground, reinitialize camera
        initializeCamera();
      }
      setAppState(nextAppState);
    });

    return () => {
      subscription.remove();
      if (cameraRef.current) {
        console.log('Cleaning up camera resources');
        cameraRef.current = null;
      }
    };
  }, [appState]);

  // Add focus effect to remount camera when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setCameraKey(prev => prev + 1);
      setIsCameraReady(false);
    });

    return unsubscribe;
  }, [navigation]);

  // Add a function to check and request camera permissions
  const ensureCameraPermissions = async () => {
    try {
      // For Android, double-check native permissions
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: "Camera Permission",
            message: "App needs camera access to take pictures",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK"
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('Camera permission denied');
        }
      }

      // Check Expo camera permissions
      if (!permission) {
        const { status } = await Camera.requestCameraPermissionsAsync();
        setPermission(status === 'granted');
        if (status !== 'granted') {
          throw new Error('Camera permission denied');
        }
      }

      return true;
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  };

  // Add camera initialization function
  const initializeCamera = async () => {
    try {
      if (!isMounted.current) return false;
      
      setCameraError(null);
      
      // Check permissions first
      const hasPermission = await ensureCameraPermissions();
      if (!hasPermission) {
        Alert.alert(
          "Camera Permission Required",
          "Please enable camera access in your device settings to use this feature.",
          [
            { text: "Cancel", onPress: () => navigation.goBack() },
            { text: "Open Settings", onPress: () => Linking.openSettings() }
          ]
        );
        return false;
      }

      // Reset camera state
      if (isMounted.current) {
        setCameraKey(prev => prev + 1);
        setIsCameraReady(false);
        // Ensure we clear any existing camera ref
        if (cameraRef.current) {
          cameraRef.current = null;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Camera initialization error:', error);
      if (isMounted.current) {
        setCameraError(error.message);
      }
      return false;
    }
  };

  // Update useEffect for camera initialization
  useEffect(() => {
    const setupCamera = async () => {
      await initializeCamera();
    };

    setupCamera();
  }, []);

  const handleCameraReady = () => {
    console.log('Camera is ready');
    setIsCameraReady(true);
  };

  const captureImage = async () => {
    if (!isMounted.current || !cameraRef.current || !isCameraReady || isProcessing || capturedImages.length >= MAX_CAPTURES) {
      console.log('Camera not ready for capture');
      return;
    }

    try {
      setIsProcessing(true);
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.8,
        skipProcessing: true,
        exif: false,
      });

      if (!isMounted.current) return;

      if (!photo.base64) {
        setMessage('Failed to capture image. Please try again.');
        setMessageType('error');
        return;
      }

      const base64Image = `data:image/jpeg;base64,${photo.base64}`;
      
      if (isMounted.current) {
        setCapturedImages(prev => [...prev, base64Image]);
        setCaptureCount(prev => prev + 1);

        if (capturedImages.length + 1 === MAX_CAPTURES) {
          await processFaceTraining([...capturedImages, base64Image]);
        }
      }
    } catch (err) {
      console.error('Capture error:', err);
      if (isMounted.current) {
        setMessage('Failed to capture image. Please try again.');
        setMessageType('error');
      }
    } finally {
      if (isMounted.current) {
        setIsProcessing(false);
      }
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

    // Test server connectivity first
    const isConnected = await testServerConnectivity();
    if (!isConnected) {
      Alert.alert(
        "Connection Error",
        "Cannot connect to face recognition server. Please check your network connection and ensure the server is running.",
        [
          { text: "Retry", onPress: () => processFaceTraining(images) },
          { text: "Cancel", onPress: () => {
            setCapturedImages([]);
            setCaptureCount(0);
          }}
        ]
      );
      return;
    }

    setIsProcessing(true);
    setTrainingProgress(0);
    
    try {
      console.log('Starting face training for:', userName, 'with email:', email);
      
      const axiosInstance = createAxiosInstance(API_URL);
      let retryCount = 0;
      const maxRetries = 2;
      let saveResponse;

      // Step 1: Save face images with retry logic
      while (retryCount <= maxRetries) {
        try {
          saveResponse = await axiosInstance.post('/train_face', {
            person_name: userName,
            user_mail: email.toLowerCase(),
            images: images
          }, {
            onUploadProgress: progressEvent => {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setTrainingProgress(progress);
            }
          });
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          console.error(`Face training attempt ${retryCount} failed:`, error.message);
          
          // If endpoint doesn't exist, don't retry
          if (error.response?.status === 404) {
            throw new Error('Face training endpoint not available on server. Please check server configuration.');
          }
          
          if (retryCount > maxRetries) {
            throw error; // Re-throw if all retries exhausted
          }
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
      }

      if (saveResponse.data.saved_count === 0) {
        throw new Error('No valid faces could be saved');
      }

      // Training is now done in train_face endpoint
      setTrainingProgress(75);

      // Step 3: Verify training with retry logic
      retryCount = 0;
      let verifyResponse;

      while (retryCount <= maxRetries) {
        try {
          verifyResponse = await axiosInstance.post('/verify_training', {
            user_mail: email.toLowerCase(),
            person_name: userName
          });
          break; // Success, exit retry loop
        } catch (error) {
          retryCount++;
          console.error(`Training verification attempt ${retryCount} failed:`, error.message);
          
          // If endpoint doesn't exist, don't retry
          if (error.response?.status === 404) {
            throw new Error('Training verification endpoint not available on server. Please check server configuration.');
          }
          
          if (retryCount > maxRetries) {
            throw error; // Re-throw if all retries exhausted
          }
          
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 2000 * retryCount));
        }
      }

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
      let errorMessage = 'Failed to complete face training. Please try again.';
      
      if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timed out. Please check your network connection and try again.';
      } else if (error.message.includes('Network Error')) {
        errorMessage = 'Network error. Please check your internet connection and ensure the server is running.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message.includes('endpoint not available')) {
        errorMessage = error.message;
      }
      
      Alert.alert(
        'Error',
        errorMessage,
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

  // Add cleanup effect
  useEffect(() => {
    return () => {
      isMounted.current = false;
      if (cameraRef.current) {
        console.log('Cleaning up camera resources');
        cameraRef.current = null;
      }
    };
  }, []);

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
      <Camera 
        key={cameraKey}
        ref={cameraRef} 
        style={styles.camera} 
        type="front"
        flashMode={flashMode}
        onCameraReady={() => {
          console.log('Camera is ready');
          if (isMounted.current) {
            setIsCameraReady(true);
            setCameraError(null);
          }
        }}
        onMountError={(error) => {
          console.error('Camera mount error:', error);
          if (isMounted.current) {
            setCameraError(error.message);
            Alert.alert(
              'Camera Error',
              'Failed to initialize camera. Please try again.',
              [
                {
                  text: 'Retry',
                  onPress: () => initializeCamera()
                },
                {
                  text: 'Go Back',
                  onPress: () => navigation.goBack()
                }
              ]
            );
          }
        }}
      />

      <View style={styles.overlay}>
        <View style={styles.faceCircle} />
        
        {/* Network Status Indicator */}
        <View style={styles.networkStatusContainer}>
          <View style={[
            styles.networkStatusIndicator,
            { backgroundColor: networkStatus === 'connected' ? '#4CAF50' : 
                             networkStatus === 'checking' ? '#FFC107' : '#FF5722' }
          ]}>
            <MaterialIcons 
              name={networkStatus === 'connected' ? 'wifi' : 
                    networkStatus === 'checking' ? 'schedule' : 'wifi-off'} 
              size={16} 
              color="white" 
            />
          </View>
          <Text style={styles.networkStatusText}>
            {networkStatus === 'connected' ? 'Server Connected' :
             networkStatus === 'checking' ? 'Checking Connection...' : 'Server Disconnected'}
          </Text>
        </View>
        
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

      {cameraError && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>{cameraError}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => initializeCamera()}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
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
  networkStatusContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  networkStatusIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  networkStatusText: {
    color: '#fff',
    fontSize: 14,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 5,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});