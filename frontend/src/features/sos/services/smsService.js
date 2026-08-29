import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

const nativeTelephony = NativeModules?.EmergencyMedia;

async function ensurePermission(permission, permissionName, label) {
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
    throw new Error('Native Android emergency SMS is unavailable on this device.');
  }
  return nativeTelephony;
}

export async function sendEmergencySms({phoneNumber, message, allowDeviceFallback = false}) {
  if (!phoneNumber || !String(phoneNumber).trim()) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'Emergency SMS is Android-only on the user device.'};
  }

  if (!getConnectivityState().isCellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service unavailable; SMS remains queued.'};
  }

  const hasPermission = await ensurePermission(
    PermissionsAndroid.PERMISSIONS.SEND_SMS,
    'SEND_SMS',
    'SMS'
  );
  if (!hasPermission) {
    return {
      status: 'FAILED',
      reason: 'SEND_SMS permission is denied or blocked. Allow Android SMS permission in Settings before sending the emergency SMS.',
    };
  }

  try {
    const result = await requireNativeTelephony().sendSms(phoneNumber, message || 'Emergency assistance requested.');
    const nativeStatus = String(result?.status || '').toLowerCase();
    if (nativeStatus === 'completed' || nativeStatus === 'sent') {
      return {status: 'SENT', reason: result.reason || 'Android confirmed the emergency SMS was handed to the system for dispatch.'};
    }
    if (nativeStatus === 'pending') {
      return {status: 'PENDING', reason: result.reason || 'Android SMS send is still awaiting confirmation.'};
    }
    if (nativeStatus === 'unsupported') {
      return {status: 'UNSUPPORTED', reason: result.reason || 'This Android device cannot send SMS directly.'};
    }
    if (nativeStatus === 'not_configured') {
      return {status: 'NOT_CONFIGURED', reason: result.reason || 'The phone does not expose a supported SMS send path.'};
    }
    if (nativeStatus === 'failed' || nativeStatus === 'error') {
      return {status: 'FAILED', reason: result.reason || 'Android rejected the emergency SMS send.'};
    }
    return {status: 'FAILED', reason: result?.reason || 'Android SMS send failed.'};
  } catch (error) {
    return {status: 'FAILED', reason: error?.message || 'Android SMS send failed.'};
  }
}

export default { sendEmergencySms };
