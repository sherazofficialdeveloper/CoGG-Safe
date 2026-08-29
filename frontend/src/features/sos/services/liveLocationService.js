import {startLiveLocation, stopLiveLocation} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';

export const LIVE_LOCATION_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

export function hasLiveLocationExpired(startedAt, now = Date.now()) {
  return Boolean(startedAt) && now - new Date(startedAt).getTime() >= LIVE_LOCATION_MAX_DURATION_MS;
}

export async function startLiveLocationSharing({token, sosId, backendId, startedAt = new Date().toISOString()}) {
  if (!sosId) {
    throw new Error('Live location requires a local SOS identifier.');
  }

  const state = getConnectivityState();
  if (!token || !backendId || !Boolean(state.isInternetReachable || state.isConnected)) {
    return {status: 'PENDING', startedAt, reason: 'Live location start is queued until internet returns.'};
  }

  await startLiveLocation(token, backendId);
  return {status: 'COMPLETED', startedAt};
}

export async function stopLiveLocationSharing({token, sosId}) {
  if (!sosId) {
    throw new Error('Live location stop requires a local SOS identifier.');
  }

  if (!token) return {status: 'COMPLETED'};
  await stopLiveLocation(token, sosId);
  return {status: 'COMPLETED'};
}

export default { startLiveLocationSharing, stopLiveLocationSharing };
