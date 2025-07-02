import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import { Camera } from "expo-camera";
import { StatusBar } from "expo-status-bar";

export default function TestCamera() {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraKey, setCameraKey] = useState(0);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraInfo, setCameraInfo] = useState({});
  const [permission, setPermission] = useState(null);
  const cameraRef = useRef(null);

  // Log camera permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      console.log('[DEBUG] Checking camera permission');
      
      const { status } = await Camera.requestCameraPermissionsAsync();
      console.log('[DEBUG] Camera permission request result:', status);
      setPermission(status === 'granted');
    };
    
    checkPermissions();
  }, []);
  
  // Add effect to start camera immediately on component mount
  useEffect(() => {
    const initCameraOnMount = async () => {
      try {
        console.log('[DEBUG] Auto-starting camera on mount');
        await startCamera();
      } catch (error) {
        console.error('[DEBUG] Error auto-starting camera:', error);
      }
    };
    
    initCameraOnMount();
    
    // Cleanup when component unmounts
    return () => {
      if (cameraActive) {
        console.log('[DEBUG] Stopping camera on unmount');
        stopCamera();
      }
    };
  }, []); // Empty dependency array means this runs once on mount

  const handleCameraReady = () => {
    console.log('[DEBUG] Camera is ready');
    setIsCameraReady(true);
    setCameraError(null);
  };

  const startCamera = async () => {
    try {
      console.log('[DEBUG] Starting camera');
      
      // Check permissions first
      if (!permission) {
        console.log('[DEBUG] Requesting camera permission again');
        const { status } = await Camera.requestCameraPermissionsAsync();
        console.log('[DEBUG] Permission result:', status);
        setPermission(status === 'granted');
        
        if (status !== 'granted') {
          const error = new Error('Camera permission denied');
          setCameraError(error.message);
          Alert.alert(
            "Permission Error",
            "Camera permission is required to use this feature"
          );
          return;
        }
      }
      
      // Print out available camera properties for debugging
      try {
        console.log('[DEBUG] Camera available props:', 
          Object.keys(Camera).filter(k => typeof Camera[k] !== 'function').join(', '));
        
        // For debugging purposes only
        console.log('[DEBUG] Using string literal "front" for camera type');
      } catch (err) {
        console.error('[DEBUG] Error inspecting Camera:', err);
      }
      
      // Reset camera state
      setIsCameraReady(false);
      setCameraActive(false);
      cameraRef.current = null;
      
      // Small delay to ensure cleanup
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update camera key to force remount
      setCameraKey(prev => prev + 1);
      
      // Another small delay before activating
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Set camera active
      setCameraActive(true);
      console.log('[DEBUG] Camera activation completed');
      
    } catch (error) {
      console.error('[DEBUG] Error starting camera:', error);
      setCameraError(error.message);
      Alert.alert(
        "Camera Error",
        `Failed to start camera: ${error.message}`
      );
    }
  };

  const stopCamera = () => {
    setCameraActive(false);
    setIsCameraReady(false);
    if (cameraRef.current) {
      cameraRef.current = null;
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current || !isCameraReady) {
      Alert.alert("Error", "Camera is not ready");
      return;
    }

    try {
      const result = await cameraRef.current.takePictureAsync();
      Alert.alert(
        "Success",
        `Picture taken! ${result.width}x${result.height}`,
        [
          {text: "OK"}
        ]
      );
    } catch (error) {
      console.error('[DEBUG] Take picture error:', error);
      Alert.alert("Error", `Failed to take picture: ${error.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Camera Test</Text>
      
      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Permission status: {permission ? "Granted ✓" : "Not granted ✗"}
        </Text>
        <Text style={styles.infoText}>
          Camera active: {cameraActive ? "Yes ✓" : "No ✗"}
        </Text>
        <Text style={styles.infoText}>
          Camera ready: {isCameraReady ? "Yes ✓" : "No ✗"}
        </Text>
        {cameraError && (
          <Text style={styles.errorText}>
            Error: {cameraError}
          </Text>
        )}
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, !cameraActive ? styles.primaryButton : styles.secondaryButton]} 
          onPress={cameraActive ? stopCamera : startCamera}
        >
          <Text style={styles.buttonText}>
            {cameraActive ? "Stop Camera" : "Start Camera"}
          </Text>
        </TouchableOpacity>
        
        {cameraActive && (
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton, !isCameraReady && styles.disabledButton]} 
            onPress={takePicture}
            disabled={!isCameraReady}
          >
            <Text style={styles.buttonText}>
              Take Picture
            </Text>
          </TouchableOpacity>
        )}
      </View>
      
      {cameraActive && (
        <View style={styles.cameraContainer}>
          <Camera
            key={cameraKey}
            style={styles.camera}
            type="front"
            onCameraReady={handleCameraReady}
            ref={cameraRef}
            onMountError={error => {
              console.error('[DEBUG] Camera mount error:', error);
              setCameraError(error.message);
            }}
            enableTorch={false}
            quality={0.85}
          />
          {!isCameraReady && (
            <View style={styles.loadingOverlay}>
              <Text style={styles.loadingText}>Initializing camera...</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  infoContainer: {
    backgroundColor: '#f0f0f0',
    padding: 15,
    borderRadius: 10,
    width: '100%',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    marginBottom: 5,
  },
  errorText: {
    color: 'red',
    fontSize: 16,
    marginTop: 5,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 20,
  },
  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 0.48,
  },
  primaryButton: {
    backgroundColor: '#3498db',
  },
  secondaryButton: {
    backgroundColor: '#e74c3c',
  },
  disabledButton: {
    backgroundColor: '#95a5a6',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cameraContainer: {
    width: '100%',
    height: 400,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
}); 