import Geolocation from '@react-native-community/geolocation';
import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission, requestPermission} from '../../../permissions/sosPermissions';

async function ensureLocationPermission() {
  if (Platform.OS !== 'android') return true;

  const permission = 'android.permission.ACCESS_FINE_LOCATION';
  let granted = await checkPermission(permission);
  if (__DEV__) console.log('[SOS][LOCATION] PERMISSION_STATE', {granted});
  if (granted !== PERMISSION_STATUS.GRANTED) {
    const result = await requestPermission(permission);
    granted = result;
    if (__DEV__) console.log('[SOS][LOCATION] PERMISSION_RESULT', {result});
  }
  if (granted !== PERMISSION_STATUS.GRANTED) {
    throw new Error('Location permission denied. Enable device location permission for SOS coordinates.');
  }
  return true;
}

function attemptLocation(options, attemptName) {
  return new Promise((resolve, reject) => {
    let timedOut = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(new Error(`Location ${attemptName} attempt timed out after ${options.timeout / 1000} seconds.`));
    }, options.timeout);

    Geolocation.getCurrentPosition(
      (position) => {
        if (!timedOut) {
          clearTimeout(timeoutHandle);
          const result = {
            latitude: position?.coords?.latitude ?? null,
            longitude: position?.coords?.longitude ?? null,
            accuracy: position?.coords?.accuracy ?? null,
            capturedAt: new Date().toISOString(),
          };
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
         reject(new Error(`Location ${attemptName} attempt failed: ${reason}`));
        }
      },
      options,
    );
  });
}

export async function getCurrentLocation() {
  if (__DEV__) console.log('[SOS][LOCATION] START');
  if (!Geolocation || typeof Geolocation.getCurrentPosition !== 'function') {
    throw new Error('Location provider module is unavailable in the installed app.');
  }

  await ensureLocationPermission();

  try {
    return await attemptLocation({
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    }, 'high-accuracy');
  } catch (highAccuracyError) {
    if (__DEV__) console.log('[SOS][LOCATION] HIGH_ACCURACY_FAILED', {reason: highAccuracyError.message});
    // A network/location-settings assisted fix can still be valid when GPS
    // cannot produce a fix immediately, including while offline.
    try {
      return await attemptLocation({
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 300000,
      }, 'best-available');
    } catch (fallbackError) {
      if (__DEV__) console.log('[SOS][LOCATION] FAILED', {
        highAccuracy: highAccuracyError.message,
        bestAvailable: fallbackError.message,
      });
      throw new Error(`No usable location provider/fix available. High accuracy: ${highAccuracyError.message} Best available: ${fallbackError.message}`);
    }
  }
}

export default { getCurrentLocation };
