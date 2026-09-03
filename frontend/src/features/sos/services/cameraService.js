import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission} from '../../../permissions/sosPermissions';
import {captureNativeSosPhotos} from './nativeMedia';

/**
 * Captures BOTH front and back SOS photos, tracking each independently.
 *
 * The native module (EmergencyMediaModule.kt#capturePhotos) already
 * captures front and back separately and reports frontImagePath/frontError
 * and backImagePath/backError independently — it only rejects if BOTH
 * lenses fail. Previously this JS layer discarded frontError/backError and
 * always reported the whole camera step as COMPLETED whenever the native
 * call resolved, even when only one lens actually succeeded. That silently
 * hid a failed lens from the UI (AdminSosDetailScreen already reads
 * services.camera.frontError/backError — it was just never receiving them)
 * and from retry — a failed lens was never retried.
 *
 * Status contract callers can rely on:
 *  - 'COMPLETED': both front and back succeeded.
 *  - 'PENDING': exactly one lens succeeded — retryable (queued by the
 *    orchestrator like sms/call/backend, see orchestrator.js
 *    RETRYABLE_SERVICES) so the missing lens gets another attempt without
 *    re-capturing the one that already succeeded (see queueWorker 'camera'
 *    processor in App.js, which merges rather than overwrites).
 *  - 'FAILED': both lenses failed, or permission/platform blocked capture
 *    entirely.
 */
export async function captureEmergencyPhotos({sosId, previousResult = null}) {
  if (!sosId) {
    throw new Error('Camera capture requires a local SOS identifier.');
  }

  // Nothing left to capture — both lenses already succeeded on a prior
  // attempt (used by the retry processor to avoid a redundant re-capture).
  if (previousResult?.frontImagePath && previousResult?.backImagePath) {
    return {
      status: 'COMPLETED',
      frontImagePath: previousResult.frontImagePath,
      backImagePath: previousResult.backImagePath,
      completedAt: previousResult.completedAt || new Date().toISOString(),
    };
  }

  if (Platform.OS !== 'android') {
    return {
      status: 'FAILED',
      frontImagePath: previousResult?.frontImagePath || null,
      backImagePath: previousResult?.backImagePath || null,
      frontError: 'Camera capture is only supported on Android.',
      backError: 'Camera capture is only supported on Android.',
      error: 'Camera capture is only supported on Android.',
    };
  }

  const hasPermission = await checkPermission('android.permission.CAMERA');
  if (hasPermission !== PERMISSION_STATUS.GRANTED) {
    return {
      status: 'FAILED',
      frontImagePath: previousResult?.frontImagePath || null,
      backImagePath: previousResult?.backImagePath || null,
      frontError: previousResult?.frontImagePath ? null : 'Camera permission denied',
      backError: previousResult?.backImagePath ? null : 'Camera permission denied',
      error: 'Camera permission denied',
    };
  }

  try {
    if (__DEV__) console.log('FRONT_CAMERA_STARTED', {sosId});
    const result = await captureNativeSosPhotos(sosId);

    // Never overwrite an already-succeeded lens from a previous attempt
    // with a missing value from this one.
    const frontImagePath = result?.frontImagePath || previousResult?.frontImagePath || null;
    const backImagePath = result?.backImagePath || previousResult?.backImagePath || null;
    const frontError = frontImagePath ? null : (result?.frontError || 'Front camera capture failed');
    const backError = backImagePath ? null : (result?.backError || 'Back camera capture failed');

    if (__DEV__ && frontImagePath) console.log('FRONT_IMAGE_CAPTURED', {sosId});
    if (__DEV__) console.log('BACK_CAMERA_STARTED', {sosId});
    if (__DEV__ && backImagePath) console.log('BACK_IMAGE_CAPTURED', {sosId});

    const bothSucceeded = Boolean(frontImagePath) && Boolean(backImagePath);
    const bothFailed = !frontImagePath && !backImagePath;

    return {
      status: bothSucceeded ? 'COMPLETED' : bothFailed ? 'FAILED' : 'PENDING',
      frontImagePath,
      backImagePath,
      frontError,
      backError,
      ...(bothFailed ? {error: frontError || backError} : {}),
      ...(bothSucceeded ? {completedAt: new Date().toISOString()} : {}),
    };
  } catch (error) {
    // The native side only rejects the whole promise when BOTH lenses
    // failed (see capturePhotos in EmergencyMediaModule.kt) — but a
    // previous partial attempt may already have one lens saved, which
    // must still be preserved and never re-reported as failed.
    const frontImagePath = previousResult?.frontImagePath || null;
    const backImagePath = previousResult?.backImagePath || null;
    const message = error?.message || 'Camera capture failed';
    return {
      status: (frontImagePath || backImagePath) ? 'PENDING' : 'FAILED',
      frontImagePath,
      backImagePath,
      frontError: frontImagePath ? null : message,
      backError: backImagePath ? null : message,
      error: message,
    };
  }
}

export default { captureEmergencyPhotos };
