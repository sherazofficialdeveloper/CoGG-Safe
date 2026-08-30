import {PermissionsAndroid, Platform} from 'react-native';
import {captureNativeSosPhotos} from './nativeMedia';

export async function captureEmergencyPhotos({sosId}) {
  if (!sosId) {
    throw new Error('Camera capture requires a local SOS identifier.');
  }

  if (Platform.OS !== 'android') {
    return {status: 'FAILED', frontImagePath: null, backImagePath: null, error: 'Camera capture is only supported on Android.'};
  }

  const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  const deniedStates = [false, PermissionsAndroid.RESULTS.DENIED, PermissionsAndroid.RESULTS.BLOCKED, PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN];
  if (deniedStates.includes(hasPermission)) {
    return {status: 'FAILED', frontImagePath: null, backImagePath: null, error: 'Camera permission denied'};
  }

  try {
    const result = await captureNativeSosPhotos(sosId);
    return {
      status: 'COMPLETED',
      frontImagePath: result?.frontImagePath || null,
      backImagePath: result?.backImagePath || null,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'FAILED',
      frontImagePath: null,
      backImagePath: null,
      error: error?.message || 'Camera capture failed',
    };
  }
}

export default { captureEmergencyPhotos };
