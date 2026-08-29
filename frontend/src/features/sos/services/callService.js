import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

const nativeTelephony = NativeModules?.EmergencyMedia;

async function ensurePermission(permission) {
  if (Platform.OS !== 'android' || !PermissionsAndroid?.check) {
    return true;
  }

  try {
    const granted = await PermissionsAndroid.check(permission);
    if (granted === true || granted === PermissionsAndroid.RESULTS.GRANTED) {
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

function requireNativeTelephony() {
  if (Platform.OS !== 'android' || !nativeTelephony) {
    throw new Error('Native Android emergency calling is unavailable on this device.');
  }
  return nativeTelephony;
}

export async function initiateEmergencyCall({emergencyNumber, allowDeviceFallback = false}) {
  if (!emergencyNumber || !String(emergencyNumber).trim()) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency call number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'Emergency calling is Android-only on the user device.'};
  }

  if (!getConnectivityState().isCellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service unavailable; call remains queued.'};
  }

  const hasPermission = await ensurePermission(PermissionsAndroid.PERMISSIONS.CALL_PHONE);
  if (!hasPermission) {
    return {
      status: 'FAILED',
      reason: 'CALL_PHONE permission is denied or blocked. Allow Android Phone permission in Settings before launching the emergency call.',
    };
  }

  try {
    const result = await requireNativeTelephony().placeCall(emergencyNumber);
    const nativeStatus = String(result?.status || '').toLowerCase();
    if (nativeStatus === 'completed' || nativeStatus === 'initiated') {
      return {
        status: 'INITIATED',
        reason: result.reason || 'Android launched the emergency call on the user device.',
      };
    }
    if (nativeStatus === 'pending') {
      return {status: 'PENDING', reason: result.reason || 'Emergency call is awaiting device confirmation.'};
    }
    if (nativeStatus === 'unsupported') {
      return {status: 'UNSUPPORTED', reason: result.reason || 'This Android device cannot place emergency calls directly.'};
    }
    if (nativeStatus === 'failed' || nativeStatus === 'error') {
      return {status: 'FAILED', reason: result.reason || 'Android rejected the emergency call launch.'};
    }
    return {status: 'FAILED', reason: result?.reason || 'Android emergency call failed.'};
  } catch (error) {
    return {status: 'FAILED', reason: error?.message || 'Android emergency call failed.'};
  }
}

export default { initiateEmergencyCall };
