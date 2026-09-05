import {createSos, reportLocation, reportSosMedia, uploadSosMedia, reportSosService} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';
import {validateNativeSosMedia} from './nativeMedia';
import {emitSosDiagnostic} from './sosDiagnosticService';
import {isValidLocation} from './locationService';
const MEDIA_COMPONENTS = [
  {component: 'frontImage', service: 'camera', path: 'frontImagePath', mimeType: 'image/jpeg'},
  {component: 'backImage', service: 'camera', path: 'backImagePath', mimeType: 'image/jpeg'},
  {component: 'audio', service: 'audio', path: 'localPath', mimeType: 'audio/mp4'},
];

export async function syncSosLocation({token, sosId, location}) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!token || !sosId || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
    || (latitude === 0 && longitude === 0)) {
    return {status: 'FAILED', error: 'A valid location and authenticated backend SOS are required.'};
  }

  if (!Boolean(getConnectivityState().isInternetReachable || getConnectivityState().isConnected)) {
    return {status: 'PENDING', reason: 'Internet unavailable; location delivery queued.'};
  }

  const response = await reportLocation(token, sosId, {
    status: 'success',
    latitude,
    longitude,
    ...(location.accuracy != null ? {accuracy: location.accuracy} : {}),
    capturedAt: location.capturedAt || new Date().toISOString(),
    ...(location.source ? {source: location.source} : {}),
  });
  return {status: 'COMPLETED', response};
}

export async function syncSosToBackend({
  token,
  sosEvent,
  idempotencyKey,
  diagnosticContext = {},
}) {
  const connectivity = getConnectivityState();
  const internetAvailable = Boolean(connectivity.isInternetReachable || connectivity.isConnected);

  if (!internetAvailable) {
    return {status: 'PENDING', reason: 'Internet unavailable; backend sync queued.'};
  }

  const payload = {
    idempotencyKey: idempotencyKey || sosEvent.id,
    location: isValidLocation(sosEvent.location)
      ? {
          latitude: sosEvent.location.latitude,
          longitude: sosEvent.location.longitude,
          ...(sosEvent.location.accuracy != null ? {accuracy: sosEvent.location.accuracy} : {}),
          ...(sosEvent.location.capturedAt ? {capturedAt: sosEvent.location.capturedAt} : {}),
          ...(sosEvent.location.source ? {source: sosEvent.location.source} : {}),
        }
      : undefined,
  };
  if (__DEV__) {
    console.log('[SOS_DEBUG] BACKEND_CREATE_START', {localSosId: sosEvent?.id || null});
    console.log('[SOS_DEBUG] BACKEND_CREATE_REQUEST', {
      localSosId: sosEvent?.id || null,
      idempotencyKey: payload.idempotencyKey,
      source: diagnosticContext.source || 'unknown',
      queueJobId: diagnosticContext.queueJobId || null,
      attempt: diagnosticContext.attempt ?? null,
      taskType: diagnosticContext.taskType || null,
      createdAt: sosEvent?.createdAt || null,
    });
    console.log('[SOS_DEBUG] IDEMPOTENCY_KEY', {key: payload.idempotencyKey});
  }
  if (__DEV__) {
    console.log('[SOS_DEBUG] CREATE_START', {eventId: sosEvent?.id});
    console.log('BACKEND_SOS_CREATE_STARTED', {eventId: sosEvent?.id});
  }

  let response;
  try {
    emitSosDiagnostic(`SOS DEBUG CREATE SOURCE: source=${diagnosticContext.source || 'unknown'} localSOSId=${sosEvent?.id || 'none'} queueJobId=${diagnosticContext.queueJobId || 'none'} attempt=${diagnosticContext.attempt ?? 0} taskType=${diagnosticContext.taskType || 'direct'} createdAt=${sosEvent?.createdAt || 'unknown'}`);
    emitSosDiagnostic('SOS DEBUG BACKEND 01: Create SOS request started');
    response = await createSos(token, payload);
  } catch (error) {
    if (__DEV__) console.log('[SOS_DEBUG] BACKEND_CREATE_ERROR', {
      localSosId: sosEvent?.id || null,
      idempotencyKey: payload.idempotencyKey,
      message: error?.message || 'Backend SOS creation failed',
      status: error?.status || null,
    });
    if (error?.status === 409) {
      emitSosDiagnostic(`SOS DEBUG 409: HTTP=409 source=${diagnosticContext.source || 'unknown'} localSOSId=${sosEvent?.id || 'none'} queueJobId=${diagnosticContext.queueJobId || 'none'} attempt=${diagnosticContext.attempt ?? 0} message=${error?.message || 'An SOS is already pending or active for this user'}`, 'error');
      return {
        status: 'FAILED',
        permanent: true,
        error: error?.message || 'An SOS is already pending or active for this user',
      };
    }
    throw error;
  }
  if (__DEV__) console.log('[SOS_DEBUG] BACKEND_CREATE_RESPONSE', {
    localSosId: sosEvent?.id || null,
    hasResponse: Boolean(response),
  });
  const sosRecord = response?.sos || response;
  const backendId = sosRecord?._id || sosRecord?.id || null;
  emitSosDiagnostic(`SOS DEBUG BACKEND 02: Response received ${response ? 'yes' : 'no'}`);
  emitSosDiagnostic(`SOS DEBUG BACKEND 04: backendId ${backendId ? 'received' : 'missing'}`);
  emitSosDiagnostic(`SOS DEBUG BACKEND 05: status ${sosRecord?.status || 'missing'}`);
  if (__DEV__) {
    console.log('[SOS_DEBUG] CREATE_RESPONSE', {status: 'received', backendId});
    if (backendId) console.log('BACKEND_SOS_CREATED', {eventId: sosEvent?.id, backendId});
  }

  if (!backendId) {
    return {
      status: 'FAILED',
      error: 'SOS backend creation did not return a valid SOS identifier.',
    };
  }
  if (__DEV__) console.log('[SOS_DEBUG] BACKEND_ID', {localSosId: sosEvent?.id || null, backendId});

  return {
    status: 'COMPLETED',
    backendId,
    emergencyLink: sosRecord?.emergencyLink || null,
    // Additive fields (already present on the existing createSos response,
    // just not previously read here) used to reconcile the local event with
    // server-authoritative state once backend confirmation lands — see
    // recovery.js / orchestrator.js / queueWorker.js "backend confirmed"
    // handling. Never used to fabricate ACTIVE locally before this point.
    serverStatus: sosRecord?.status || null,
    activatedAt: sosRecord?.activatedAt || null,
  };
}

/**
 * Transfers captured device files only after the backend SOS exists. Local
 * Android paths are never reported as storage references.
 *
 * Each media component (frontImage, backImage, audio) is uploaded
 * independently: one component's upload failure must never block another
 * component from being attempted (mirrors the same isolation the native
 * capture side already guarantees for front/back camera + audio). A
 * component that has already been durably stored on a previous attempt is
 * never re-uploaded — `sosEvent.mediaUploadState` persists per-component
 * outcomes locally so a retried queue job resumes only the components that
 * still need it, instead of creating duplicate cloud objects for media that
 * already succeeded.
 */
export async function uploadCapturedSosMedia({token, sosEvent, component = null}) {
  const backendId = sosEvent?.backendId;
  if (!token || !backendId) {
    return {status: 'PENDING', reason: 'Media upload is waiting for an authenticated backend SOS.'};
  }

  const connectivity = getConnectivityState();
  if (!Boolean(connectivity.isInternetReachable || connectivity.isConnected)) {
    return {status: 'PENDING', reason: 'Internet unavailable; media upload queued.'};
  }

  if (__DEV__) console.log('MEDIA_UPLOAD_STARTED', {backendId});

  const uploadState = {...(sosEvent.mediaUploadState || {})};
  const uploaded = [];
  const failures = [];

  for (const item of MEDIA_COMPONENTS.filter(candidate => !component || candidate.component === component)) {
    // Idempotent skip: this component was already durably stored on a
    // previous (possibly partially-failed) attempt.
    if (uploadState[item.component]?.status === 'SUCCESS') {
      uploaded.push({component: item.component, storageRef: uploadState[item.component].storageRef});
      continue;
    }
    if (['FAILED', 'REPORTED_FAILED'].includes(uploadState[item.component]?.status)) continue;

    const capture = sosEvent.services?.[item.service] || {};
    const localPath = capture[item.path];
    // Per-component error, when the capture layer reports front/back
    // independently (camera). Falls back to the whole-service error for
    // single-output services (audio) where there's only one path to begin
    // with. This must be checked per-component, NOT via capture.status —
    // capture.status is 'PENDING' for a camera capture where only one lens
    // failed, and that partial failure still needs to be reported for the
    // specific missing component instead of silently staying "pending"
    // forever on the backend/admin panel.
    const componentErrorKey = item.component === 'frontImage' ? 'frontError'
      : item.component === 'backImage' ? 'backError'
      : null;
    const componentError = componentErrorKey ? capture[componentErrorKey] : capture.error;
    const componentFailed = !localPath && (componentError || capture.status === 'FAILED');

    try {
      if (localPath) {
        emitSosDiagnostic(`SOS DEBUG UPLOAD: ${item.component} started`);
        if (__DEV__) console.log('[SOS_DEBUG] MEDIA_UPLOAD_START', {
          component: item.component,
          localPath,
          backendId,
        });
        const validFile = await validateNativeSosMedia(localPath);
        if (__DEV__) console.log('[SOS_DEBUG] MEDIA_VALIDATION', {
          component: item.component,
          localPath,
          valid: Boolean(validFile),
          backendId,
        });
        if (!validFile) {
          emitSosDiagnostic(`SOS DEBUG UPLOAD: ${item.component} local validation failed`, 'error');
          uploadState[item.component] = {
            status: 'FAILED',
            component: item.component === 'frontImage' ? 'FRONT_CAMERA' : item.component === 'backImage' ? 'BACK_CAMERA' : 'AUDIO',
            error: `${item.component} file is missing, unreadable, or empty.`,
          };
          failures.push({component: item.component, error: uploadState[item.component].error, permanent: true});
          continue;
        }
        const response = await uploadSosMedia(token, backendId, item.component, {
          uri: localPath.startsWith('file://') ? localPath : `file://${localPath}`,
          type: item.mimeType,
          name: `${item.component}-${Date.now()}${item.component === 'audio' ? '.m4a' : '.jpg'}`,
        });
        emitSosDiagnostic(`SOS DEBUG UPLOAD: ${item.component} completed`);
        if (__DEV__) console.log('[SOS_DEBUG] MEDIA_UPLOAD_RESULT', {
          component: item.component,
          backendId,
          status: response?.sos?.components?.[item.component]?.status || null,
          storageRef: response?.sos?.components?.[item.component]?.storageRef || null,
        });
        const media = response?.sos?.components?.[item.component];
        if (media?.status !== 'success' || !media.storageRef) {
          throw new Error(`Backend did not confirm durable storage for ${item.component}.`);
        }
        uploadState[item.component] = {
          status: 'SUCCESS',
          component: item.component === 'frontImage' ? 'FRONT_CAMERA' : item.component === 'backImage' ? 'BACK_CAMERA' : 'AUDIO',
          storageRef: media.storageRef,
        };
        uploaded.push({component: item.component, storageRef: media.storageRef});
        if (__DEV__) {
          const tag = item.component === 'frontImage' ? 'FRONT_IMAGE_UPLOAD_SUCCESS'
            : item.component === 'backImage' ? 'BACK_IMAGE_UPLOAD_SUCCESS'
            : 'AUDIO_UPLOAD_SUCCESS';
          console.log(tag, {backendId, component: item.component});
        }
      } else if (componentFailed && uploadState[item.component]?.status !== 'REPORTED_FAILED') {
        await reportSosMedia(token, backendId, item.component, {
          status: 'failed',
          error: componentError || `${item.component} capture failed on the device.`,
        });
        uploadState[item.component] = {status: 'REPORTED_FAILED'};
      }
    } catch (error) {
      emitSosDiagnostic(`SOS DEBUG UPLOAD: ${item.component} failed: ${error?.message || 'Upload failed'}`, 'error');
      if (__DEV__) console.log('[SOS_DEBUG] MEDIA_UPLOAD_ERROR', {
        component: item.component,
        backendId,
        message: error?.message || 'Upload failed',
      });
      // This component stays retryable; every other component still gets
      // its own attempt below rather than the whole job aborting here.
      uploadState[item.component] = {status: 'PENDING', error: error?.message || 'Upload failed'};
      failures.push({component: item.component, error: error?.message || 'Upload failed'});
    }
  }

  await sosLocalStore.upsertSos({...sosEvent, mediaUploadState: uploadState});

  if (failures.length > 0) {
    const onlyPermanentFailures = failures.every(item => item.permanent);
    return {
      status: onlyPermanentFailures ? 'FAILED' : 'PENDING',
      reason: `Media upload incomplete for: ${failures.map(item => item.component).join(', ')}.`,
      uploaded,
      failures,
    };
  }

  return {status: 'COMPLETED', uploaded};
}

/**
 * Report a service result (SMS, CALL, location, etc.) to the backend.
 * These results are reported as they complete in parallel, independent of media upload.
 */
export async function reportServiceResult({token, sosId, component, status, error}) {
  if (!token || !sosId) {
    return {status: 'PENDING', reason: 'Service result reporting is waiting for authentication/backend SOS.'};
  }

  const connectivity = getConnectivityState();
  if (!Boolean(connectivity.isInternetReachable || connectivity.isConnected)) {
    // Queue retry instead of hard fail
    return {status: 'PENDING', reason: 'Internet unavailable; service result reporting queued.'};
  }

  try {
    const response = await reportSosService(token, sosId, component, {
      status,
      error: error || null,
    });
    return {status: 'COMPLETED', response};
  } catch (err) {
    return {status: 'FAILED', error: err?.message || 'Failed to report service result to backend.'};
  }
}

export default {syncSosToBackend, uploadCapturedSosMedia, reportServiceResult};
