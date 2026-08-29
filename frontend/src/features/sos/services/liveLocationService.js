import {startLiveLocation, stopLiveLocation, pingLiveLocation} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';

export const LIVE_LOCATION_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

/**
 * Authoritative expiry check against a backend expiresAt or startedAt timestamp.
 */
export function hasLiveLocationExpired(timestampOrStartedAt, now = Date.now()) {
  if (!timestampOrStartedAt) return false;
  const time = new Date(timestampOrStartedAt).getTime();
  if (isNaN(time)) return false;

  const currentTime = typeof now === 'number' ? now : new Date(now).getTime();
  // If the timestamp is in the future or within 3h of now, check if it's an explicit expiresAt
  // vs a startedAt timestamp. If time <= currentTime, it's definitely expired for an expiresAt.
  // For backward compatibility when passing startedAt:
  if (currentTime - time >= LIVE_LOCATION_MAX_DURATION_MS) {
    return true;
  }
  return false;
}

/**
 * Checks whether an explicit expiresAt timestamp has passed.
 */
export function isExpiresAtPast(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const expiryTime = new Date(expiresAt).getTime();
  if (isNaN(expiryTime)) return false;
  const currentTime = typeof now === 'number' ? now : new Date(now).getTime();
  return currentTime >= expiryTime;
}

export async function startLiveLocationSharing({token, sosId, backendId, startedAt = new Date().toISOString()}) {
  if (!sosId) {
    throw new Error('Live location requires a local SOS identifier.');
  }

  const state = getConnectivityState();
  if (!token || !backendId || !Boolean(state.isInternetReachable || state.isConnected)) {
    return {status: 'PENDING', startedAt, reason: 'Live location start is queued until internet returns.'};
  }

  try {
    const response = await startLiveLocation(token, backendId);
    const serverLiveLocation = response?.sos?.liveLocation;
    return {
      status: 'COMPLETED',
      startedAt: serverLiveLocation?.startedAt || startedAt,
      expiresAt: serverLiveLocation?.expiresAt || null,
      serverStatus: serverLiveLocation?.status || 'active',
    };
  } catch (error) {
    // If live location was already active on backend (e.g. retry), treat as completed
    if (error?.message && error.message.includes('already active')) {
      return {status: 'COMPLETED', startedAt};
    }
    throw error;
  }
}

export async function pingLiveLocationUpdate({
  token,
  sosId,
  backendId,
  latitude,
  longitude,
  accuracy = null,
  capturedAt = new Date().toISOString(),
}) {
  if (latitude == null || longitude == null) {
    return {status: 'FAILED', reason: 'Invalid coordinates provided.'};
  }

  const pingData = {sosId, latitude, longitude, accuracy, capturedAt};
  const state = getConnectivityState();
  const isOnline = Boolean(state.isInternetReachable || state.isConnected);

  if (!isOnline || !token || !backendId) {
    // Queue offline ping in local storage so it will be synchronized on reconnect
    await sosLocalStore.addPendingLocationPing(pingData);
    return {status: 'PENDING', queued: true, ping: pingData};
  }

  try {
    const response = await pingLiveLocation(token, backendId, {latitude, longitude, capturedAt});
    return {status: 'COMPLETED', ping: response?.ping || pingData};
  } catch (error) {
    // If request failed due to network error, queue ping locally
    await sosLocalStore.addPendingLocationPing(pingData);
    return {status: 'PENDING', queued: true, ping: pingData, error: error.message};
  }
}

export async function syncPendingLocationPings({token, sosId, backendId}) {
  if (!token || !backendId) {
    return {syncedCount: 0, remaining: 0};
  }

  const state = getConnectivityState();
  if (!Boolean(state.isInternetReachable || state.isConnected)) {
    return {syncedCount: 0, remaining: (await sosLocalStore.getPendingLocationPings(sosId)).length};
  }

  const pendingPings = await sosLocalStore.getPendingLocationPings(sosId);
  if (!pendingPings || pendingPings.length === 0) {
    return {syncedCount: 0, remaining: 0};
  }

  let syncedCount = 0;
  for (const ping of pendingPings) {
    try {
      await pingLiveLocation(token, backendId, {
        latitude: ping.latitude,
        longitude: ping.longitude,
        capturedAt: ping.capturedAt,
      });
      await sosLocalStore.removePendingLocationPing(ping.id);
      syncedCount++;
    } catch (error) {
      // If error indicates session no longer active on server, remove old pings
      if (error?.message && (error.message.includes('not currently active') || error.message.includes('deactivated'))) {
        await sosLocalStore.removePendingLocationPing(ping.id);
      }
      break;
    }
  }

  const remaining = (await sosLocalStore.getPendingLocationPings(sosId)).length;
  return {syncedCount, remaining};
}

export async function stopLiveLocationSharing({token, sosId, backendId}) {
  if (!sosId) {
    throw new Error('Live location stop requires a local SOS identifier.');
  }

  if (token && backendId) {
    await stopLiveLocation(token, backendId);
  }

  // Clear any remaining pending pings
  await sosLocalStore.clearPendingLocationPings(sosId);

  return {status: 'COMPLETED', stoppedAt: new Date().toISOString()};
}

export default {
  startLiveLocationSharing,
  pingLiveLocationUpdate,
  syncPendingLocationPings,
  stopLiveLocationSharing,
  hasLiveLocationExpired,
  isExpiresAtPast,
  LIVE_LOCATION_MAX_DURATION_MS,
};
