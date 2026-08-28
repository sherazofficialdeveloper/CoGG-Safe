import {createSos, reportLocation, uploadSosMedia} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';

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
  const backendId = response?.sos?.id || response?.sos?._id || null;

  // Capture jobs run independently of backend creation. Reconcile their
  // locally persisted result after the idempotent create so a slow GPS
  // reading is not silently omitted from an otherwise successful SOS.
  if (backendId && sosEvent.location?.latitude != null && sosEvent.location?.longitude != null) {
    await reportLocation(token, backendId, {
      latitude: sosEvent.location.latitude,
      longitude: sosEvent.location.longitude,
    });
  }

  return {
    status: 'COMPLETED',
    backendId,
    emergencyLink: response?.sos?.emergencyLink || null,
  };
}

function mediaFile(path, mimeType, name) {
  return {uri: path, type: mimeType, name};
}

/**
 * Uploads only files that a native capture adapter actually persisted. The
 * adapter boundary intentionally returns NOT_CONFIGURED when no supported
 * recorder/camera module exists, so this function never invents media.
 */
export async function uploadCapturedSosMedia({token, sosEvent}) {
  const connectivity = getConnectivityState();
  if (!Boolean(connectivity.isInternetReachable || connectivity.isConnected)) {
    return {status: 'PENDING', reason: 'Internet unavailable; media upload queued.'};
  }
  if (!token || !sosEvent?.backendId) {
    return {status: 'PENDING', reason: 'Waiting for SOS backend synchronization.'};
  }

  const uploads = [
    ['frontImage', sosEvent.services?.camera?.frontImagePath, 'image/jpeg', 'sos-front.jpg'],
    ['backImage', sosEvent.services?.camera?.backImagePath, 'image/jpeg', 'sos-back.jpg'],
    ['audio', sosEvent.services?.audio?.localPath, 'audio/mp4', 'sos-audio.m4a'],
  ].filter(([, path]) => Boolean(path));

  if (uploads.length === 0) {
    return {status: 'NOT_CONFIGURED', reason: 'No locally captured media is available to upload.'};
  }

  const results = await Promise.allSettled(
    uploads.map(([component, path, type, name]) =>
      uploadSosMedia(token, sosEvent.backendId, component, mediaFile(path, type, name))
    )
  );
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  return {status: 'COMPLETED', uploadedComponents: uploads.map(([component]) => component)};
}

export default {syncSosToBackend, uploadCapturedSosMedia};
