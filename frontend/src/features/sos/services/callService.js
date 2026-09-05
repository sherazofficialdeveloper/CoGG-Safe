import {NativeModules, Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission, requestPermission} from '../../../permissions/sosPermissions';
import {getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';
import {emitSosDiagnostic, ensureSosNativeDiagnosticListener} from './sosDiagnosticService';
import {normalizePhoneNumber} from './phoneNumber';

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

  const connectivity = getConnectivityState();
  const cellularAvailable = Boolean(connectivity.isCellularAvailable || connectivity.details?.type === 'cellular');
  if (!cellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service is unavailable; emergency call is queued for retry.'};
  }

  const callPermission = 'android.permission.CALL_PHONE';
  let hasPermission = await checkPermission(callPermission);
  if (__DEV__) console.log('[SOS][CALL] CALL_PHONE_PERMISSION', {state: hasPermission});
  if (hasPermission !== PERMISSION_STATUS.GRANTED) {
    const permissionResult = await requestPermission(callPermission);
    hasPermission = permissionResult;
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

  // On a single-SIM device there's nothing to choose, so no preference is
  // ever saved and this stays -1 ("let Android pick"). On dual-SIM devices
  // this is the subscription the user chose in Profile settings; if it has
  // since disappeared, the native layer falls back gracefully rather than
  // failing the call.
  let preferredSubscriptionId = -1;
  try {
    const saved = await sosLocalStore.getEmergencyCallSimPreference();
    if (saved?.subscriptionId != null) {
      preferredSubscriptionId = saved.subscriptionId;
    }
  } catch (error) {
    // A storage read failure must never block the emergency call.
  }

  try {
    if (__DEV__) console.log('[SOS][CALL] SERVICE_INVOKED', {
      numberConfigured: Boolean(emergencyNumber),
      nativeMethod: 'EmergencyMedia.placeCall',
    });
    if (__DEV__) console.log('[SOS][CALL] ATTEMPT_NATIVE', {hasPreferredSubscription: preferredSubscriptionId >= 0});
    emitSosDiagnostic('CALL DEBUG — Native placeCall() invoked');
    const result = await emergencyMedia.placeCall(normalizedNumber, preferredSubscriptionId);
    if (__DEV__) console.log('[SOS][CALL] NATIVE_RESULT', result);
    const normalized = normalizeCallResult(result);
    if (normalized.status === 'INITIATED') emitSosDiagnostic('CALL SUCCESS — Call request accepted', 'success');
    else emitSosDiagnostic('CALL ERROR — ' + normalized.reason, 'error');
    return normalized;
  } catch (error) {
    const reason = error?.message || 'Emergency call failed.';
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
