import Geolocation from '@react-native-community/geolocation';
import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission, requestPermission} from '../../../permissions/sosPermissions';
import {sosLocalStore} from '../storage';
import {emitSosDiagnostic} from './sosDiagnosticService';

const LOCATION_SOURCE_SET = new Set(['gps', 'network', 'fused', 'passive', 'cell', 'wifi', 'unknown']);

function toValidDate(value) {
  if (value == null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  return null;
}

function buildLocationError(message, code, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

async function getLastKnownLocation() {
  try {
    const events = await sosLocalStore.getAllEvents();
    const lastKnown = events
      .map(event => event?.location)
      .filter(Boolean)
      .filter(isValidLocation)
      .sort((left, right) => new Date(right.capturedAt).getTime() - new Date(left.capturedAt).getTime())[0];
    if (__DEV__) console.log('[SOS_DEBUG] LAST_KNOWN_RESULT', {found: Boolean(lastKnown)});
    return lastKnown || null;
  } catch (error) {
    if (__DEV__) console.log('[SOS][LOCATION] LAST_KNOWN_LOOKUP_FAILED', {reason: error?.message});
    return null;
  }
}

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') return true;

  const finePermission = 'android.permission.ACCESS_FINE_LOCATION';
  const coarsePermission = 'android.permission.ACCESS_COARSE_LOCATION';
  let fineGranted = await checkPermission(finePermission);
  let coarseGranted = await checkPermission(coarsePermission);
  if (__DEV__) console.log('[SOS_DEBUG] LOCATION_PERMISSION', {fine: fineGranted, coarse: coarseGranted});
  if (fineGranted !== PERMISSION_STATUS.GRANTED && coarseGranted !== PERMISSION_STATUS.GRANTED) {
    fineGranted = await requestPermission(finePermission);
    if (fineGranted !== PERMISSION_STATUS.GRANTED) {
      coarseGranted = await requestPermission(coarsePermission);
    }
  }
  if (fineGranted !== PERMISSION_STATUS.GRANTED && coarseGranted !== PERMISSION_STATUS.GRANTED) {
    throw buildLocationError('Location permission denied. Enable location permission for SOS coordinates.', 'LOCATION_PERMISSION_DENIED');
  }
  return true;
}

function attemptLocation(options, attemptName) {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(buildLocationError(`Location ${attemptName} attempt timed out after ${options.timeout / 1000} seconds.`, 'LOCATION_TIMEOUT', {attempt: attemptName, timeout: options.timeout}));
    }, options.timeout);

    Geolocation.getCurrentPosition(
      (position) => {
        if (!timedOut) {
         clearTimeout(timeoutHandle);
         const capturedDate = toValidDate(position?.timestamp);
         const capturedAtValue = capturedDate ? capturedDate.toISOString() : new Date().toISOString();
         const result = {
           latitude: position?.coords?.latitude ?? null,
           longitude: position?.coords?.longitude ?? null,
           accuracy: position?.coords?.accuracy ?? null,
           capturedAt: capturedAtValue,
           source: (position?.provider || (options.enableHighAccuracy ? 'gps' : 'network')).toString().trim().toLowerCase() || null,
           providerTimestamp: position?.timestamp ?? null,
         };
         emitSosDiagnostic('SOS DEBUG LOCATION 05: Position received');
         emitSosDiagnostic(`SOS DEBUG LOCATION 06: Coordinates ${isValidLocation(result) ? 'valid' : 'invalid'}`);
         emitSosDiagnostic(`SOS DEBUG LOCATION 07: Accuracy ${result.accuracy ?? 'unknown'}`);
         if (!isValidLocation(result)) {
           reject(buildLocationError(`Location ${attemptName} returned invalid coordinates.`, 'INVALID_LOCATION_RESULT', {attempt: attemptName, result}));
           return;
         }
         if (__DEV__) console.log('[SOS][LOCATION] SUCCESS', {attempt: attemptName, result});
         resolve(result);
        }
      },
      (error) => {
        if (!timedOut) {
         clearTimeout(timeoutHandle);
         const reason = error?.message || 'Location provider failed without a message.';
         if (__DEV__) console.log('[SOS][LOCATION] PROVIDER_ERROR', {
           attempt: attemptName,
           code: error?.code ?? null,
           reason,
         });
         reject(buildLocationError(`Location ${attemptName} attempt failed: ${reason}`, 'LOCATION_PROVIDER_UNAVAILABLE', {
           attempt: attemptName,
           code: error?.code ?? null,
           reason,
         }));
        }
      },
      options,
    );
  });
}

export function isValidLocation(location) {
  if (!location || typeof location !== 'object') return false;

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);

  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return false;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;

  if (location.accuracy !== undefined && location.accuracy !== null && location.accuracy !== '') {
    const accuracy = Number(location.accuracy);
    if (!Number.isFinite(accuracy) || accuracy < 0) return false;
  }

  const capturedAt = toValidDate(location.capturedAt);
  if (!capturedAt) return false;

  if (location.source !== undefined && location.source !== null && location.source !== '') {
    const source = String(location.source).trim().toLowerCase();
    if (!LOCATION_SOURCE_SET.has(source)) return false;
  }

  if (location.providerTimestamp !== undefined && location.providerTimestamp !== null && location.providerTimestamp !== '') {
    const providerTimestamp = toValidDate(location.providerTimestamp);
    if (!providerTimestamp) return false;
  }

  return true;
}

export async function getCurrentLocation() {
  emitSosDiagnostic('SOS DEBUG LOCATION 01: Started');
  if (__DEV__) console.log('[SOS][LOCATION] START');
  if (!Geolocation || typeof Geolocation.getCurrentPosition !== 'function') {
    throw buildLocationError('Location provider module is unavailable in the installed app.', 'LOCATION_PROVIDER_MODULE_UNAVAILABLE');
  }

  await ensureLocationPermission();
  emitSosDiagnostic('SOS DEBUG LOCATION 02: Permission granted');
  if (__DEV__) console.log('[SOS_DEBUG] LOCATION_SERVICES', {providerAvailable: Boolean(Geolocation)});

  try {
    // Prefer a quick network/fused-assisted fix first. It is usually faster on
    // modern devices and still produces a valid lat/lng for the emergency.
    const quickResult = await attemptLocation({
      enableHighAccuracy: false,
      timeout: 7000,
      maximumAge: 120000,
    }, 'best-available');
    if (__DEV__) console.log('[SOS_DEBUG] BEST_AVAILABLE_RESULT', {success: true});
    return quickResult;
  } catch (bestAvailableError) {
    if (__DEV__) console.log('[SOS_DEBUG] HIGH_ACCURACY_RESULT', {success: false, message: highAccuracyError.message});
    if (__DEV__) console.log('[SOS][LOCATION] HIGH_ACCURACY_FAILED', {reason: highAccuracyError.message});
    // A network/location-settings assisted fix can still be valid when GPS
    // cannot produce a fix immediately, including while offline.
    try {
      if (__DEV__) console.log('[SOS_DEBUG] HIGH_ACCURACY_RETRY');
      const result = await attemptLocation({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }, 'high-accuracy');
      if (__DEV__) console.log('[SOS_DEBUG] HIGH_ACCURACY_RETRY_RESULT', {success: true});
      return result;
    } catch (highAccuracyError) {
      const fallbackError = highAccuracyError || bestAvailableError;
      const lastKnown = await getLastKnownLocation();
      if (lastKnown) {
        if (__DEV__) console.log('[SOS][LOCATION] LAST_KNOWN_FALLBACK', {location: lastKnown});
        return lastKnown;
      }

      // No current fix is a retryable device condition, not an SOS validation
      // failure. Keep the SOS alive and let the durable location queue retry.
      if (__DEV__) console.log('[SOS][LOCATION] RETRY_QUEUED', {
        bestAvailable: bestAvailableError?.message || null,
        highAccuracy: fallbackError?.message || null,
      });
      return {
        status: 'PENDING',
        error: null,
        queued: true,
        retryable: true,
        reason: 'Location fix is temporarily unavailable; retry queued.',
      };
    }
  }
}

export default { getCurrentLocation, isValidLocation };
