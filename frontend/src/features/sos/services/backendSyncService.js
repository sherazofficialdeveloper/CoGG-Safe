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
    // Single source of truth: the exact message snapshotted onto this SOS
    // event when it was triggered (see App.js onPending), which is also
    // exactly what was sent in the first emergency SMS. The backend/admin
    // SOS detail must never fall back to its own default text when this
    // is present.
    ...(typeof sosEvent.meta?.emergencyMessage === 'string' && sosEvent.meta.emergencyMessage.trim()
      ? {emergencyMessage: sosEvent.meta.emergencyMessage.trim()}
      : {}),
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
      // Older/deployed backends may still answer with the legacy 409. Treat it
      // as a duplicate-session reconciliation condition, never as a user-facing
      // validation failure. The local SOS stays active and recovery can bind it
      // to the existing server record on the next refresh.
      if (__DEV__) console.log('[SOS][BACKEND] DUPLICATE_OPEN_SOS_RECONCILE', {localSosId: sosEvent?.id || null});
      return {
        status: 'PENDING',
        error: null,
        reason: 'An SOS session is already active for this user; waiting for reconciliation.',
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

  const uploadOne = async item => {
    if (uploadState[item.component]?.status === 'SUCCESS') {
      return {component: item.component, storageRef: uploadState[item.component].storageRef};
    }
    const capture = sosEvent.services?.[item.service] || {};
    const localPath = capture[item.path];
    const componentError = item.component === 'frontImage' ? capture.frontError
      : item.component === 'backImage' ? capture.backError : capture.error;
    if (!localPath) {
      return {component: item.component, pending: true, error: componentError || null};
    }
    emitSosDiagnostic(`SOS DEBUG UPLOAD: ${item.component} started`);
    const validFile = await validateNativeSosMedia(localPath);
    if (!validFile) return {component: item.component, pending: true, error: `${item.component} file is not readable yet.`};
    const uploadFile = {
      uri: localPath.startsWith('file://') ? localPath : `file://${localPath}`,
      type: item.mimeType,
      name: `${item.component}-${Date.now()}${item.component === 'audio' ? '.m4a' : '.jpg'}`,
    };
    let response = null;
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        response = await uploadSosMedia(token, backendId, item.component, uploadFile);
        if (response?.sos?.components?.[item.component]?.status === 'success') break;
        throw new Error(`Backend did not confirm durable storage for ${item.component}.`);
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1200));
      }
    }
    if (!response) throw lastError || new Error(`Upload failed for ${item.component}.`);
    const media = response?.sos?.components?.[item.component];
    if (media?.status !== 'success' || !media.storageRef) throw new Error(`Backend did not confirm durable storage for ${item.component}.`);
    return {component: item.component, storageRef: media.storageRef};
  };

  const candidates = MEDIA_COMPONENTS.filter(candidate => !component || candidate.component === component);
  const settled = await Promise.allSettled(candidates.map(uploadOne));
  const uploaded = [];
  const failures = [];
  settled.forEach((result, index) => {
    const item = result.status === 'fulfilled' ? result.value : {component: candidates[index].component, error: result.reason?.message || 'Upload failed'};
    if (item.storageRef) {
      uploadState[item.component] = {status: 'SUCCESS', component: item.component === 'frontImage' ? 'FRONT_CAMERA' : item.component === 'backImage' ? 'BACK_CAMERA' : 'AUDIO', storageRef: item.storageRef};
      uploaded.push(item);
    } else {
      uploadState[item.component] = {status: 'PENDING', error: item.error || null};
      failures.push(item);
    }
  });

  await sosLocalStore.updateSosMediaUploadState(sosEvent.id, uploadState);
  if (failures.length > 0) {
    return {status: 'PENDING', reason: `Media upload incomplete for: ${failures.map(item => item.component).join(', ')}.`, uploaded, failures};
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

  const normalizedStatus = (() => {
    const value = String(status || '').trim().toLowerCase();
    if (['success', 'completed', 'initiated', 'sent', 'delivered', 'queued_to_android', 'sent_broadcast', 'delivered_broadcast'].includes(value)) return 'success';
    if (['pending', 'processing', 'unknown', 'failed', 'unsupported', 'skipped'].includes(value)) return value;
    return 'unknown';
  })();

  try {
    const response = await reportSosService(token, sosId, component, {
      status: normalizedStatus,
      error: error || null,
    });
    return {status: 'COMPLETED', response};
  } catch (err) {
    return {status: 'FAILED', error: err?.message || 'Failed to report service result to backend.'};
  }
}

export default {syncSosToBackend, uploadCapturedSosMedia, reportServiceResult};
