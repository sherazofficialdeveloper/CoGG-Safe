import {NativeModules, PermissionsAndroid, Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission, requestPermission} from '../../../permissions/sosPermissions';
import {connectivityService, getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';
import {emitSosDiagnostic, ensureSosNativeDiagnosticListener} from './sosDiagnosticService';
import {normalizePhoneNumber} from './phoneNumber';

function showCallDebug() {}


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

/**
 * Lists the device's active SIMs/subscriptions, e.g. for a settings screen
 * SIM picker. Returns [] on iOS, on jest/no-native environments, or if the
 * native layer can't enumerate SIMs — callers should treat that the same as
 * "let the device pick automatically" rather than as an error.
 */
export async function getAvailableEmergencySims() {
  if (Platform.OS !== 'android') return [];
  // SIM mapping uses Android's subscription APIs, which require READ_PHONE_STATE.
  // Request it only when SOS telephony is actually being executed.
  if (PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE) {
    try {
      await requestPermission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    } catch (_) {}
  }
  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia || typeof emergencyMedia.getAvailableSims !== 'function') return [];
  try {
    const sims = await emergencyMedia.getAvailableSims();
    return Array.isArray(sims) ? sims : [];
  } catch (error) {
    return [];
  }
}

export async function getSavedEmergencyCallSim() {
  return sosLocalStore.getEmergencyCallSimPreference();
}

export async function saveEmergencyCallSim(subscriptionId, meta = {}) {
  return sosLocalStore.setEmergencyCallSimPreference(subscriptionId, meta);
}

export async function initiateEmergencyCall({emergencyNumber}) {
  ensureSosNativeDiagnosticListener();
  showCallDebug(`CALL DEBUG 1: emergencyNumber = ${String(emergencyNumber)}`);
  emitSosDiagnostic('CALL DEBUG — Service reached');
  const emergencyNumberDebugValue =
    emergencyNumber === undefined
      ? 'undefined'
      : emergencyNumber === null
        ? 'null'
        : emergencyNumber === ''
          ? 'EMPTY'
          : String(emergencyNumber);
  emitSosDiagnostic(`Emergency Number Debug: ${emergencyNumberDebugValue}`);
  const normalizedNumber = normalizePhoneNumber(emergencyNumber);
  showCallDebug(`CALL DEBUG 2: normalized = ${String(normalizedNumber)}`);
  if (__DEV__) console.log('[SOS][CALL] RUNNER_STARTED', {hasNumber: Boolean(emergencyNumber)});
  if (__DEV__) console.log('[SOS][CALL] EMERGENCY_NUMBER_RESOLVED', {configured: Boolean(normalizedNumber)});
  if (!normalizedNumber) {
    emitSosDiagnostic('CALL ERROR — No valid emergency number', 'error');
    if (__DEV__) console.log('[SOS][CALL] FAILED', {reason: 'No emergency call number is configured'});
    return {status: 'NOT_CONFIGURED', reason: 'No emergency call number is configured for this collection.'};
  }

  emitSosDiagnostic('CALL DEBUG — Number found');

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'Emergency call is only supported on Android devices.'};
  }

  // Required to map Android's PhoneAccountHandle to the exact SIM 1 subscription.
  if (PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE) {
    try {
      await requestPermission(PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE);
    } catch (_) {}
  }

  const callPermission = 'android.permission.CALL_PHONE';
  let hasPermission = await checkPermission(callPermission);
  showCallDebug(`CALL DEBUG 3: CALL_PHONE permission = ${hasPermission}`);
  if (__DEV__) console.log('[SOS][CALL] CALL_PHONE_PERMISSION', {state: hasPermission});
  if (hasPermission !== PERMISSION_STATUS.GRANTED) {
    showCallDebug('CALL DEBUG 3: CALL_PHONE permission requested');
    const permissionResult = await requestPermission(callPermission);
    hasPermission = permissionResult;
    showCallDebug(`CALL DEBUG 3: CALL_PHONE permission = ${hasPermission}`);
    if (__DEV__) console.log('[SOS][CALL] CALL_PHONE_PERMISSION_RESULT', {state: permissionResult});
  }

  if (hasPermission !== PERMISSION_STATUS.GRANTED) {
    emitSosDiagnostic('CALL ERROR — CALL_PHONE permission denied', 'error');
    return {status: 'FAILED', reason: 'Phone permission denied. Emergency call cannot be placed.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia || typeof emergencyMedia.placeCall !== 'function') {
    emitSosDiagnostic('CALL ERROR — Native placeCall failed: Native Android emergency call module is unavailable.', 'error');
    if (__DEV__) console.log('[SOS][CALL] NATIVE_MODULE_UNAVAILABLE');
    return {status: 'FAILED', reason: 'Native Android emergency call module is unavailable.'};
  }

  // SOS communication is automatic: native Android selects physical SIM 1
  // (slot 0) only; if SIM 1 is unavailable, native Android rejects the request Do not load a
  // previously saved SIM preference and do not open a SIM chooser.
  const preferredSubscriptionId = -1;

  try {
    if (__DEV__) console.log('[SOS][CALL] SERVICE_INVOKED', {
      numberConfigured: Boolean(emergencyNumber),
      nativeMethod: 'EmergencyMedia.placeCall',
    });
    if (__DEV__) console.log('[SOS][CALL] ATTEMPT_NATIVE', {hasPreferredSubscription: preferredSubscriptionId >= 0});
    showCallDebug(`CALL DEBUG 4: immediately before NativeModules.EmergencyMedia.placeCall()`);
    emitSosDiagnostic('CALL DEBUG — Native placeCall() invoked');
    const result = await emergencyMedia.placeCall(normalizedNumber, preferredSubscriptionId);
    showCallDebug(`CALL DEBUG 5: native placeCall success result = ${JSON.stringify(result)}`);
    if (__DEV__) console.log('[SOS][CALL] NATIVE_RESULT', result);
    const normalized = normalizeCallResult(result);
    if (normalized.status === 'INITIATED') emitSosDiagnostic('CALL SUCCESS — Call request accepted', 'success');
    else emitSosDiagnostic('CALL ERROR — ' + normalized.reason, 'error');
    return normalized;
  } catch (error) {
    const reason = error?.message || 'Emergency call failed.';
    showCallDebug(`CALL DEBUG 6: native placeCall error/failure = ${reason}`);
    emitSosDiagnostic('CALL ERROR — ' + reason, 'error');
    if (/no service|cellular service|radio off|temporary|signal|unavailable/i.test(reason)) {
      return {status: 'PENDING', reason};
    }
    return normalizeCallResult({status: 'FAILED', reason});
  }
}

export default {
  initiateEmergencyCall,
  getAvailableEmergencySims,
  getSavedEmergencyCallSim,
  saveEmergencyCallSim,
};
