import {NativeModules, Platform} from 'react-native';
import {startLiveLocation, stopLiveLocation, pingLiveLocation} from '../../../api/resources';
import {API_BASE_URL} from '../../../api/config';
import {getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';

export const LIVE_LOCATION_MAX_DURATION_MS = 3 * 60 * 60 * 1000;

const native = NativeModules?.EmergencyMedia;

export function hasLiveLocationExpired(startedAt, now = Date.now()) {
  return Boolean(startedAt) && now - new Date(startedAt).getTime() >= LIVE_LOCATION_MAX_DURATION_MS;
}

async function persistPendingPing(sosId, ping) {
  const event = await sosLocalStore.getSosById(sosId);
  if (!event) return;
  await sosLocalStore.upsertSos({...event, pendingLocationPings: [...(event.pendingLocationPings || []), ping].slice(-100)});
}

export async function startLiveLocationSharing({token, sosId, backendId, startedAt = new Date().toISOString()}) {
  if (!sosId) throw new Error('Live location requires a local SOS identifier.');
  if (!token || !backendId) return {status: 'PENDING', startedAt, reason: 'Live location requires token and backendId.'};
  if (Platform.OS !== 'android') return {status: 'UNSUPPORTED', startedAt, reason: 'Live location foreground service is currently implemented for Android.'};
  if (hasLiveLocationExpired(startedAt)) return {status: 'STOPPED_MAX_DURATION', startedAt, reason: 'Live location reached its three-hour limit.'};

  const state = getConnectivityState();
  if (!Boolean(state.isInternetReachable || state.isConnected)) {
    return {status: 'PENDING', startedAt, reason: 'Internet is unavailable; live location will start when connectivity returns.'};
  }

  try {
    const response = await startLiveLocation(token, backendId);
    const serverStartedAt = response?.sos?.liveLocation?.startedAt || startedAt;

    if (!native || typeof native.startLiveLocationService !== 'function') {
      return {status: 'FAILED', startedAt: serverStartedAt, reason: 'Native live location foreground service is unavailable in this build.'};
    }

    await native.startLiveLocationService(API_BASE_URL, token, backendId);
    return {status: 'COMPLETED', startedAt: serverStartedAt, liveLocation: response?.sos?.liveLocation || null};
  } catch (error) {
    if (/already active/i.test(error?.message || '')) {
      try {
        await native?.startLiveLocationService?.(API_BASE_URL, token, backendId);
        return {status: 'COMPLETED', startedAt};
      } catch (nativeError) {
        return {status: 'FAILED', startedAt, reason: nativeError?.message || 'Unable to restart live location service.'};
      }
    }
    if (/active SOS|pending/i.test(error?.message || '')) return {status: 'PENDING', startedAt, reason: error.message};
    return {status: 'FAILED', startedAt, reason: error?.message || 'Failed to start live location'};
  }
}

export async function syncPendingLocationPings({token, sosId, backendId}) {
  if (!token || !sosId || !backendId) return {status: 'PENDING', reason: 'Location pings require an authenticated backend SOS.'};
  const event = await sosLocalStore.getSosById(sosId);
  const pendingPings = event?.pendingLocationPings || [];
  if (!pendingPings.length) return {status: 'COMPLETED', synced: 0};

  const remaining = [];
  for (const ping of pendingPings) {
    try { await pingLiveLocation(token, backendId, ping); }
    catch (_) { remaining.push(ping); }
  }
  await sosLocalStore.upsertSos({...event, pendingLocationPings: remaining});
  return remaining.length
    ? {status: 'PENDING', synced: pendingPings.length - remaining.length, reason: 'Some location pings remain queued.'}
    : {status: 'COMPLETED', synced: pendingPings.length};
}

export async function stopLiveLocationSharing({token, sosId, backendId}) {
  if (!sosId) throw new Error('Live location stop requires a local SOS identifier.');

  try { await native?.stopLiveLocationService?.(); } catch (_) { /* local stop must not block backend stop */ }
  if (!token || !backendId) return {status: 'COMPLETED'};

  const response = await stopLiveLocation(token, backendId);
  const event = await sosLocalStore.getSosById(sosId);
  if (event) {
    await sosLocalStore.upsertSos({
      ...event,
      liveLocationStatus: response?.sos?.liveLocation?.status || 'STOPPED_BY_USER',
      services: {
        ...event.services,
        liveLocation: {
          ...(event.services?.liveLocation || {}),
          status: 'STOPPED_BY_USER',
          stoppedAt: response?.sos?.liveLocation?.stoppedAt || new Date().toISOString(),
        },
      },
    });
  }
  return {status: 'COMPLETED'};
}

// Kept for compatibility with existing imports. There is no JS timer anymore.
export function stopLocationPolling() {}
export function stopAllLocationPolling() {}

export default {startLiveLocationSharing, stopLiveLocationSharing, stopLocationPolling, stopAllLocationPolling, syncPendingLocationPings, hasLiveLocationExpired};
