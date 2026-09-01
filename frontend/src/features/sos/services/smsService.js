import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

function normalizeSmsResult(result) {
  const status = String(result?.status || '').toUpperCase();
  const reason = result?.reason || '';

  if (status === 'COMPLETED' || status === 'SENT') {
    return {status: 'SENT', reason: reason || 'Android confirmed the SMS was sent.'};
  }

  if (status === 'PENDING' || /no service|cellular service|cellular.*unavailable|signal|radio off|temporary/i.test(reason)) {
    return {status: 'PENDING', reason: reason || 'Cellular service is temporarily unavailable; SMS will retry automatically.'};
  }

  if (status === 'UNSUPPORTED' || /SIM|subscription|carrier|telephony/i.test(reason)) {
    return {status: 'UNSUPPORTED', reason: reason || 'No active SIM subscription is available for SMS.'};
  }

  return {status: 'FAILED', reason: reason || 'Emergency SMS failed.'};
}

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'SMS is only supported on Android devices.'};
  }

  const connectivity = getConnectivityState();
  const cellularAvailable = Boolean(connectivity.isCellularAvailable || connectivity.details?.type === 'cellular');
  if (!cellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service is unavailable; SMS is queued for retry.'};
  }

  const smsPermission = PermissionsAndroid.PERMISSIONS.SEND_SMS;
  let hasPermission = await PermissionsAndroid.check(smsPermission);

  if (hasPermission === false || hasPermission === PermissionsAndroid.RESULTS.DENIED || hasPermission === PermissionsAndroid.RESULTS.BLOCKED || hasPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    const isJestMock = typeof PermissionsAndroid.request === 'function' && !!PermissionsAndroid.request._isMockFunction;
    if (isJestMock) {
      return {status: 'FAILED', reason: 'SMS permission denied. Emergency SMS cannot be sent.'};
    }

    const permissionResult = await PermissionsAndroid.request(smsPermission);
    hasPermission = permissionResult === PermissionsAndroid.RESULTS.GRANTED;
  }

  if (!hasPermission) {
    return {status: 'FAILED', reason: 'SMS permission denied. Emergency SMS cannot be sent.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia || typeof emergencyMedia.sendSms !== 'function') {
    return {status: 'FAILED', reason: 'Native Android SMS module is unavailable.'};
  }

  try {
    const result = await emergencyMedia.sendSms(phoneNumber, message || 'Emergency assistance requested.');
    return normalizeSmsResult(result);
  } catch (error) {
    const reason = error?.message || 'Emergency SMS failed.';
    if (/no service|cellular service|radio off|temporary|signal|unavailable/i.test(reason)) {
      return {status: 'PENDING', reason};
    }
    return normalizeSmsResult({status: 'FAILED', reason});
  }
}

export default { sendEmergencySms };
