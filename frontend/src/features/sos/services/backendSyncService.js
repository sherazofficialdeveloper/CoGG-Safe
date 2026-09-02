import {createSos, reportSosMedia, uploadSosMedia, reportSosService} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';
const MEDIA_COMPONENTS = [
  {component: 'frontImage', service: 'camera', path: 'frontImagePath', mimeType: 'image/jpeg'},
  {component: 'backImage', service: 'camera', path: 'backImagePath', mimeType: 'image/jpeg'},
  {component: 'audio', service: 'audio', path: 'localPath', mimeType: 'audio/mp4'},
];

export async function syncSosToBackend({token, sosEvent, idempotencyKey}) {
  const connectivity = getConnectivityState();
  const internetAvailable = Boolean(connectivity.isInternetReachable || connectivity.isConnected);

  if (!internetAvailable) {
    return {status: 'PENDING', reason: 'Internet unavailable; backend sync queued.'};
  }

  const payload = {
    idempotencyKey: idempotencyKey || sosEvent.id,
    location: sosEvent.location?.latitude != null && sosEvent.location?.longitude != null
      ? {
          latitude: sosEvent.location.latitude,
          longitude: sosEvent.location.longitude,
        }
      : undefined,
  };

  const response = await createSos(token, payload);
  const sosRecord = response?.sos || response;
  const backendId = sosRecord?._id || sosRecord?.id || null;

  if (!backendId) {
    return {
      status: 'FAILED',
      error: 'SOS backend creation did not return a valid SOS identifier.',
    };
  }

  return {
    status: 'COMPLETED',
    backendId,
    emergencyLink: sosRecord?.emergencyLink || null,
  };
}

/**
 * Transfers captured device files only after the backend SOS exists. Local
 * Android paths are never reported as storage references.
 */
export async function uploadCapturedSosMedia({token, sosEvent}) {
  const backendId = sosEvent?.backendId;
  if (!token || !backendId) {
    return {status: 'PENDING', reason: 'Media upload is waiting for an authenticated backend SOS.'};
  }

  const connectivity = getConnectivityState();
  if (!Boolean(connectivity.isInternetReachable || connectivity.isConnected)) {
    return {status: 'PENDING', reason: 'Internet unavailable; media upload queued.'};
  }

  const uploaded = [];
  for (const item of MEDIA_COMPONENTS) {
    const capture = sosEvent.services?.[item.service] || {};
    const localPath = capture[item.path];
    if (localPath) {
      const response = await uploadSosMedia(token, backendId, item.component, {
        uri: localPath.startsWith('file://') ? localPath : `file://${localPath}`,
        type: item.mimeType,
        name: `${item.component}-${Date.now()}${item.component === 'audio' ? '.m4a' : '.jpg'}`,
      });
      const media = response?.sos?.components?.[item.component];
      if (media?.status !== 'success' || !media.storageRef) {
        throw new Error(`Backend did not confirm durable storage for ${item.component}.`);
      }
      uploaded.push({component: item.component, storageRef: media.storageRef});
    } else if (capture.status === 'FAILED') {
      await reportSosMedia(token, backendId, item.component, {
        status: 'failed',
        error: capture.error || `${item.component} capture failed on the device.`,
      });
    }
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
