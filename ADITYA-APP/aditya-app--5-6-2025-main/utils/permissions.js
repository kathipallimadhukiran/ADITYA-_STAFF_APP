import { PermissionsAndroid, Platform, Linking } from 'react-native';

export const checkCameraPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const cameraStatus = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA
      );
      const storageStatus = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      );
      return cameraStatus && storageStatus;
    } catch (err) {
      console.warn('Permission check error:', err);
      return false;
    }
  }
  return true;
};

export const requestCameraPermissions = async () => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
      ]);

      return (
        granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.READ_EXTERNAL_STORAGE'] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn('Permission request error:', err);
      return false;
    }
  }
  return true;
};

export const showPermissionSettingsAlert = () => {
  Alert.alert(
    'Permissions Required',
    'Camera and storage permissions are needed. Please enable them in settings.',
    [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Open Settings',
        onPress: () => Linking.openSettings(),
      },
    ],
    { cancelable: false }
  );
};