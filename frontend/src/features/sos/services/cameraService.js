import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission} from '../../../permissions/sosPermissions';
import {sosLocalStore} from '../storage';
import {captureNativeSosPhotos} from './nativeMedia';
import {emitSosDiagnostic} from './sosDiagnosticService';

function isUsableMediaPath(value) {
  if (typeof value !== 'string') return false;
  const cleaned = value.trim();
  if (!cleaned || cleaned === 'null' || cleaned === 'undefined') return false;
  return cleaned.length > 0;
}

async function persistPendingCameraMedia(event, {frontImagePath, backImagePath}) {
  if (!event || !event.id) return;
  const uploadState = {...(event.mediaUploadState || {})};
  const nextState = {...uploadState};
  if (isUsableMediaPath(frontImagePath)) {
    nextState.frontImage = {
      ...(nextState.frontImage || {}),
      status: 'PENDING',
      localPath: frontImagePath,
      component: 'frontImage',
      capturedAt: new Date().toISOString(),
    };
  }
  if (isUsableMediaPath(backImagePath)) {
    nextState.backImage = {
      ...(nextState.backImage || {}),
      status: 'PENDING',
      localPath: backImagePath,
      component: 'backImage',
      capturedAt: new Date().toISOString(),
    };
  }
  await sosLocalStore.upsertSos({...event, mediaUploadState: nextState});
}

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
export async function captureEmergencyPhotos({sosId, previousResult = null, event = null}) {
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
    emitSosDiagnostic('SOS DEBUG FRONT 01: Capture started');
    emitSosDiagnostic('SOS DEBUG BACK 01: Capture started');
    if (__DEV__) console.log('FRONT_CAMERA_STARTED', {sosId});
    const needFront = !isUsableMediaPath(previousResult?.frontImagePath);
    const needBack = !isUsableMediaPath(previousResult?.backImagePath);
    const result = await captureNativeSosPhotos(sosId, needFront, needBack);
    emitSosDiagnostic('SOS DEBUG FRONT 02: Native capture returned');
    emitSosDiagnostic('SOS DEBUG BACK 02: Native capture returned');

    const frontImagePath = result?.frontImagePath || previousResult?.frontImagePath || null;
    const backImagePath = result?.backImagePath || previousResult?.backImagePath || null;
    const frontIsUsable = isUsableMediaPath(frontImagePath);
    const backIsUsable = isUsableMediaPath(backImagePath);
    emitSosDiagnostic(`SOS DEBUG FRONT 03: File path ${frontImagePath ? 'present' : 'missing'}`);
    emitSosDiagnostic(`SOS DEBUG BACK 03: File path ${backImagePath ? 'present' : 'missing'}`);
    emitSosDiagnostic(`SOS DEBUG FRONT 04: File validation ${frontIsUsable ? 'usable' : 'invalid'}`);
    emitSosDiagnostic(`SOS DEBUG BACK 04: File validation ${backIsUsable ? 'usable' : 'invalid'}`);
    if (__DEV__) {
      console.log('[SOS_DEBUG] FRONT_CAPTURE_RESULT', {sosId, localPath: frontImagePath, valid: frontIsUsable});
      console.log('[SOS_DEBUG] BACK_CAPTURE_RESULT', {sosId, localPath: backImagePath, valid: backIsUsable});
    }
    const frontError = frontIsUsable ? null : (result?.frontError || 'Front camera capture failed');
    const backError = backIsUsable ? null : (result?.backError || 'Back camera capture failed');

    if (__DEV__ && frontIsUsable) console.log('FRONT_IMAGE_CAPTURED', {sosId});
    if (__DEV__) console.log('BACK_CAMERA_STARTED', {sosId});
    if (__DEV__ && backIsUsable) console.log('BACK_IMAGE_CAPTURED', {sosId});

    const bothSucceeded = frontIsUsable && backIsUsable;
    const bothFailed = !frontIsUsable && !backIsUsable;

    const output = {
      status: bothSucceeded ? 'COMPLETED' : bothFailed ? 'FAILED' : 'PENDING',
      frontImagePath: frontIsUsable ? frontImagePath : null,
      backImagePath: backIsUsable ? backImagePath : null,
      frontComponent: 'FRONT_CAMERA',
      backComponent: 'BACK_CAMERA',
      frontError,
      backError,
      ...(bothFailed ? {error: frontError || backError} : {}),
      ...(bothSucceeded ? {completedAt: new Date().toISOString()} : {}),
    };
    if (!frontIsUsable) emitSosDiagnostic(`SOS DEBUG FRONT FAILED: ${frontError}`, 'error');
    if (!backIsUsable) emitSosDiagnostic(`SOS DEBUG BACK FAILED: ${backError}`, 'error');

    if (event && event.id && (frontIsUsable || backIsUsable)) {
      await persistPendingCameraMedia(event, {
        frontImagePath: frontIsUsable ? frontImagePath : null,
        backImagePath: backIsUsable ? backImagePath : null,
      });
    }

    return output;
  } catch (error) {
    const frontImagePath = previousResult?.frontImagePath || null;
    const backImagePath = previousResult?.backImagePath || null;
    const message = error?.message || 'Camera capture failed';
    emitSosDiagnostic(`SOS DEBUG FRONT FAILED: ${message}`, 'error');
    emitSosDiagnostic(`SOS DEBUG BACK FAILED: ${message}`, 'error');
    const output = {
      status: (frontImagePath || backImagePath) ? 'PENDING' : 'FAILED',
      frontImagePath,
      backImagePath,
      frontError: frontImagePath ? null : message,
      backError: backImagePath ? null : message,
      error: message,
    };

    if (event && event.id && (frontImagePath || backImagePath)) {
      await persistPendingCameraMedia(event, {frontImagePath, backImagePath});
    }
    return output;
  }
}

export default { captureEmergencyPhotos };
