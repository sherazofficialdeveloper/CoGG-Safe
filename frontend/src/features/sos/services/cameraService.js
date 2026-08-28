import {PermissionsAndroid, Platform} from 'react-native';
import {captureNativeSosPhotos} from './nativeMedia';

function normalizePermissionResult(status) {
  if (typeof status === 'string') {
    return status.toLowerCase() === 'granted';
  }
  return Boolean(status);
}

function describePermissionFailure(status) {
  if (!status) return 'Camera permission denied';
  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'Camera permission is blocked. Open device settings to allow access.';
  }
  if (status === PermissionsAndroid.RESULTS.BLOCKED) {
    return 'Camera permission is blocked by the device.';
  }
  return `Camera permission ${status}`;
}

export async function checkCameraPermission() {
  if (Platform.OS !== 'android') return false;
  const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  return normalizePermissionResult(status);
}

export async function requestCameraPermission() {
  if (Platform.OS !== 'android') {
    return {granted: false, status: 'unavailable', reason: 'Camera capture is unavailable on this platform.'};
  }

  const current = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  if (normalizePermissionResult(current)) {
    return {granted: true, status: PermissionsAndroid.RESULTS.GRANTED, reason: null};
  }

  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  const granted = normalizePermissionResult(status);

  return {
    granted,
    status,
    reason: granted ? null : describePermissionFailure(status),
  };
}

export async function captureEmergencyPhotos({sosId}) {
  if (!sosId) {
    throw new Error('Camera capture requires a local SOS identifier.');
  }

  const permission = await requestCameraPermission();
  if (!permission.granted) {
    return {
      status: 'FAILED',
      frontImagePath: null,
      backImagePath: null,
      error: permission.reason || 'Camera permission denied',
    };
  }

  let result;
  try {
    result = await captureNativeSosPhotos(sosId);
  } catch (error) {
    return {
      status: 'FAILED',
      frontImagePath: null,
      backImagePath: null,
      error: error?.message || 'Camera capture failed.',
    };
  }

  const frontImagePath = result?.frontImagePath || null;
  const backImagePath = result?.backImagePath || null;
  const frontError = result?.frontError || null;
  const backError = result?.backError || null;

  if (!frontImagePath && !backImagePath) {
    return {
      status: 'FAILED',
      frontImagePath: null,
      backImagePath: null,
      error: frontError || backError || 'Camera capture failed.',
    };
  }

  return {
    status: 'COMPLETED',
    frontImagePath,
    backImagePath,
    frontError,
    backError,
    completedAt: new Date().toISOString(),
  };
}

export default {captureEmergencyPhotos, checkCameraPermission, requestCameraPermission};
