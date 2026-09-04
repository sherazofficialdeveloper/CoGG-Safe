import {startLiveLocation, stopLiveLocation, pingLiveLocation} from '../../../api/resources';
import {getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';
import {getCurrentLocation, isValidLocation} from './locationService';

export const LIVE_LOCATION_MAX_DURATION_MS = 3 * 60 * 60 * 1000;
export const LIVE_LOCATION_POLL_INTERVAL_MS = 30 * 1000;

const liveLocationPollers = {};

export function hasLiveLocationExpired(startedAt, now = Date.now()) {
  return Boolean(startedAt) && now - new Date(startedAt).getTime() >= LIVE_LOCATION_MAX_DURATION_MS;
}

async function persistPendingPing(sosId, ping) {
  const event = await sosLocalStore.getSosById(sosId);
  if (!event) return;
  const pendingPings = [...(event.pendingLocationPings || []), ping].slice(-100);
  await sosLocalStore.upsertSos({...event, pendingLocationPings: pendingPings});
}

async function sendCurrentLocation({token, backendId, sosId}) {
  const location = await getCurrentLocation();
  if (!isValidLocation(location)) return;
  const ping = {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    capturedAt: location.capturedAt,
    source: location.source,
  };
  try {
    await pingLiveLocation(token, backendId, ping);
  } catch (error) {
    await persistPendingPing(sosId, ping);
    throw error;
  }
}

function startLocationPolling({token, backendId, sosId}) {
  if (liveLocationPollers[sosId]) return;

  const poll = async () => {
    const event = await sosLocalStore.getSosById(sosId);
    if (event?.liveLocationStartedAt && hasLiveLocationExpired(event.liveLocationStartedAt)) {
      stopLocationPolling(sosId);
      return;
    }
    const state = getConnectivityState();
    if (!Boolean(state.isInternetReachable || state.isConnected)) return;
    try {
      // A ping is periodic by design; it is not conditional on movement.
      await sendCurrentLocation({token, backendId, sosId});
    } catch (error) {
      console.log('[LiveLocation] Ping failed:', error?.message);
    }
  };

  liveLocationPollers[sosId] = setInterval(poll, LIVE_LOCATION_POLL_INTERVAL_MS);
  poll();
}

export function stopLocationPolling(sosId) {
  if (liveLocationPollers[sosId]) {
    clearInterval(liveLocationPollers[sosId]);
    delete liveLocationPollers[sosId];
  }
}

export function stopAllLocationPolling() {
  Object.keys(liveLocationPollers).forEach(stopLocationPolling);
}

export async function startLiveLocationSharing({token, sosId, backendId, startedAt = new Date().toISOString()}) {
  if (!sosId) throw new Error('Live location requires a local SOS identifier.');
  if (!token || !backendId) return {status: 'PENDING', startedAt, reason: 'Live location requires token and backendId.'};
  if (hasLiveLocationExpired(startedAt)) {
    stopLocationPolling(sosId);
    return {status: 'STOPPED_MAX_DURATION', startedAt, reason: 'Live location reached its three-hour limit.'};
  }

  const state = getConnectivityState();
  if (!Boolean(state.isInternetReachable || state.isConnected)) {
    return {status: 'PENDING', startedAt, reason: 'Live location queued until internet is available.'};
  }

  try {
    const response = await startLiveLocation(token, backendId);
    const serverStartedAt = response?.sos?.liveLocation?.startedAt || startedAt;
    startLocationPolling({token, backendId, sosId});
    return {status: 'COMPLETED', startedAt: serverStartedAt};
  } catch (error) {
    if (/already active/i.test(error?.message || '')) {
      startLocationPolling({token, backendId, sosId});
      return {status: 'COMPLETED', startedAt};
    }
    if (/active SOS|pending/i.test(error?.message || '')) {
      return {status: 'PENDING', startedAt, reason: error.message};
    }
    return {status: 'FAILED', startedAt, reason: error?.message || 'Failed to start live location'};
  }
}

export async function syncPendingLocationPings({token, sosId, backendId}) {
  if (!token || !sosId || !backendId) return {status: 'PENDING', reason: 'Location pings require an authenticated backend SOS.'};
  const event = await sosLocalStore.getSosById(sosId);
  const pendingPings = event?.pendingLocationPings || [];
  if (pendingPings.length === 0) return {status: 'COMPLETED', synced: 0};

  const remaining = [];
  for (const ping of pendingPings) {
    try {
      await pingLiveLocation(token, backendId, ping);
    } catch (error) {
      remaining.push(ping);
    }
  }
  await sosLocalStore.upsertSos({...event, pendingLocationPings: remaining});
  return remaining.length ? {status: 'PENDING', synced: pendingPings.length - remaining.length, reason: 'Some location pings remain queued.'} : {status: 'COMPLETED', synced: pendingPings.length};
}

export async function stopLiveLocationSharing({token, sosId, backendId}) {
  if (!sosId) throw new Error('Live location stop requires a local SOS identifier.');
  stopLocationPolling(sosId);
  if (!token || !backendId) return {status: 'COMPLETED'};
  await stopLiveLocation(token, backendId);
  return {status: 'COMPLETED'};
}

export default {startLiveLocationSharing, stopLiveLocationSharing, stopLocationPolling, stopAllLocationPolling, syncPendingLocationPings, hasLiveLocationExpired};