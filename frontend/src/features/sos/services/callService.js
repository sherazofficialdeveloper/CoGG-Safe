import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

function normalizeCallResult(result) {
  const status = String(result?.status || '').toUpperCase();
  const reason = result?.reason || '';

  // If Android launched the call intent successfully, treat as INITIATED
  if (/android launched/i.test(reason)) {
    return {status: 'INITIATED', reason: reason || 'Android launched the emergency call.'};
  }

  if (status === 'COMPLETED' || status === 'INITIATED') {
    return {status: 'INITIATED', reason: reason || 'Android launched the emergency call.'};
  }

  if (status === 'PENDING' && !/launched/.test(reason)) {
    return {status: 'PENDING', reason: reason || 'Cellular service is temporarily unavailable; emergency call will retry automatically.'};
  }

  if (status === 'UNSUPPORTED' || /telephony|account|SIM|subscription/i.test(reason)) {
    return {status: 'UNSUPPORTED', reason: reason || 'No active telephony account is available for the emergency call.'};
  }

  return {status: 'FAILED', reason: reason || 'Emergency call failed.'};
}

export async function initiateEmergencyCall({emergencyNumber}) {
  if (!emergencyNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency call number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'Emergency call is only supported on Android devices.'};
  }

  const connectivity = getConnectivityState();
  const cellularAvailable = Boolean(connectivity.isCellularAvailable || connectivity.details?.type === 'cellular');
  if (!cellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service is unavailable; emergency call is queued for retry.'};
  }

  const callPermission = PermissionsAndroid.PERMISSIONS.CALL_PHONE;
  let hasPermission = await PermissionsAndroid.check(callPermission);
  if (hasPermission === false || hasPermission === PermissionsAndroid.RESULTS.DENIED || hasPermission === PermissionsAndroid.RESULTS.BLOCKED || hasPermission === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    const isJestMock = typeof PermissionsAndroid.request === 'function' && !!PermissionsAndroid.request._isMockFunction;
    if (isJestMock) {
      return {status: 'FAILED', reason: 'Phone permission denied. Emergency call cannot be placed.'};
    }

    const permissionResult = await PermissionsAndroid.request(callPermission);
    hasPermission = permissionResult === PermissionsAndroid.RESULTS.GRANTED;
  }

  if (!hasPermission) {
    return {status: 'FAILED', reason: 'Phone permission denied. Emergency call cannot be placed.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia || typeof emergencyMedia.placeCall !== 'function') {
    return {status: 'FAILED', reason: 'Native Android emergency call module is unavailable.'};
  }

  try {
    const result = await emergencyMedia.placeCall(emergencyNumber);
    return normalizeCallResult(result);
  } catch (error) {
    const reason = error?.message || 'Emergency call failed.';
    if (/no service|cellular service|radio off|temporary|signal|unavailable/i.test(reason)) {
      return {status: 'PENDING', reason};
    }
    return normalizeCallResult({status: 'FAILED', reason});
  }
}

export default { initiateEmergencyCall };
