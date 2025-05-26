import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Dimensions,
  Button,
  TouchableOpacity
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const MAX_CAPTURES = 10;
const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.6;

export default function FaceCaptureScreen({ navigation }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [flashMode, setFlashMode] = useState('off');

  useEffect(() => {
    (async () => {
      if (!permission?.granted) {
        await requestPermission();
      }
    })();
  }, []);

  const captureImage = async () => {
    if (isUploading || capturedImages.length >= MAX_CAPTURES) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.7,
        skipProcessing: true
      });

      setCapturedImages(prev => [...prev, photo.base64]);

      if (capturedImages.length + 1 === MAX_CAPTURES) {
        setIsUploading(true);
        await uploadToBackend([...capturedImages, photo.base64]);
      }
    } catch (err) {
      console.error('Capture error:', err);
      Alert.alert('Error', 'Failed to capture image');
    }
  };

  const uploadToBackend = async (images) => {
    try {
      const backendUrl = 'https://your-backend-url.com/api/face-upload';
      const response = await fetch(backendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images }),
      });

      if (!response.ok) throw new Error('Upload failed');

      Alert.alert('Success', 'Images uploaded successfully!');
      navigation?.goBack();
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Error', 'Failed to upload images');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleFlash = () => {
    setFlashMode(current => (current === 'off' ? 'torch' : 'off'));
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text>Camera permission required</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
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
      />

      <View style={styles.overlay}>
        <View style={styles.faceCircle} />
        
        <Text style={styles.instructionText}>
          {capturedImages.length < MAX_CAPTURES 
            ? "Position your face in the circle" 
            : "Processing..."}
        </Text>
        
        <Text style={styles.counterText}>
          {capturedImages.length}/{MAX_CAPTURES} photos
        </Text>
      </View>

      <View style={styles.bottomControls}>
        <TouchableOpacity style={styles.flashButton} onPress={toggleFlash}>
          <Text style={styles.flashText}>
            {flashMode === 'off' ? 'Flash Off' : 'Flash On'}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.captureButton} 
          onPress={captureImage}
          disabled={isUploading || capturedImages.length >= MAX_CAPTURES}
        >
          <View style={[
            styles.captureButtonInner,
            (isUploading || capturedImages.length >= MAX_CAPTURES) && 
              styles.captureButtonDisabled
          ]} />
        </TouchableOpacity>
        
        <View style={styles.flashButton} />
      </View>

      {isUploading && (
        <View style={styles.uploadingContainer}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadingText}>Uploading...</Text>
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
    top: '25%',
    width: '100%',
    alignItems: 'center',
  },
  faceCircle: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 3,
    borderColor: '#00FFAA',
    opacity: 0.5,
  },
  instructionText: {
    marginTop: 20,
    fontSize: 18,
    color: '#fff',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  counterText: {
    marginTop: 10,
    fontSize: 16,
    color: '#fff',
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
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  captureButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  flashButton: {
    padding: 15,
  },
  flashText: {
    color: '#fff',
    fontSize: 16,
  },
  uploadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  uploadingText: {
    color: '#fff',
    marginTop: 15,
    fontSize: 18,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});