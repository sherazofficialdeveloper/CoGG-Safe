import {createSos} from '../../../api/resources';
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

export default { syncSosToBackend };
