import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Camera } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';

export default function CameraTest() {
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      console.log('Camera permission status:', status);
    })();

    return () => {
      console.log('Camera component unmounting');
      cameraRef.current = null;
    };
  }, []);

  const handleCameraReady = () => {
    console.log('Camera is ready');
    setCameraReady(true);
  };

  const takePicture = async () => {
    if (!cameraRef.current || !cameraReady) {
      console.log('Camera not ready for capture');
      return;
    }

    try {
      console.log('Taking picture...');
      const photo = await cameraRef.current.takePictureAsync();
      console.log('Picture taken:', photo.uri);
    } catch (error) {
      console.error('Failed to take picture:', error);
    }
  };

  if (hasPermission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No access to camera</Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={async () => {
            const { status } = await Camera.requestCameraPermissionsAsync();
            setHasPermission(status === 'granted');
          }}
        >
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Camera Test Component</Text>
      
      <View style={styles.cameraContainer}>
        {cameraActive && (
          <Camera
            style={styles.camera}
            type={Camera.Constants.Type.front}
            onCameraReady={handleCameraReady}
            ref={cameraRef}
          />
        )}
      </View>
      
      <View style={styles.controls}>
        <TouchableOpacity 
          style={[styles.button, !cameraReady && styles.buttonDisabled]}
          onPress={takePicture}
          disabled={!cameraReady}
        >
          <Text style={styles.buttonText}>Take Picture</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button}
          onPress={() => setCameraActive(!cameraActive)}
        >
          <Text style={styles.buttonText}>
            {cameraActive ? 'Stop Camera' : 'Start Camera'}
          </Text>
        </TouchableOpacity>
      </View>
      
      <Text style={styles.statusText}>
        Camera status: {cameraReady ? 'Ready' : 'Not ready'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 50,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  cameraContainer: {
    width: '80%',
    height: 400,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 20,
  },
  camera: {
    flex: 1,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    padding: 20,
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 10,
    minWidth: 120,
  },
  buttonDisabled: {
    backgroundColor: '#B0BEC5',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  errorText: {
    color: 'red',
    marginBottom: 20,
  },
  statusText: {
    marginTop: 20,
  },
}); 