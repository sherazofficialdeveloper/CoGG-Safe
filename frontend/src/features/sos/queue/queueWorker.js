import {sosLocalStore} from '../storage';
import {getConnectivityState} from '../connectivity';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5000;
const PROCESSING_RECOVERY_MS = 60 * 1000;

function requiresInternet(item) {
  return ['BACKEND_SYNC', 'BACKEND', 'MEDIA_UPLOAD', 'EMAIL', 'NOTIFICATIONS', 'LIVELOCATION'].includes(item.type);
}

function requiresCellular(item) {
  return ['SMS', 'CALL'].includes(item.type);
}

function isEligible(item, state, now = Date.now()) {
  if (item.status !== 'PENDING' && item.status !== 'RETRY_WAITING') return false;
  if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now) return false;
  if (requiresInternet(item) && !Boolean(state.isInternetReachable || state.isConnected)) return false;
  if (requiresCellular(item) && !state.isCellularAvailable) return false;
  return true;
}

export async function enqueueSosJob({sosId, type, serviceName, payload = {}}) {
  return sosLocalStore.enqueueQueueItem({
    id: `${sosId}:${type}`,
    sosId,
    type,
    serviceName,
    payload,
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date().toISOString(),
    nextAttemptAt: new Date().toISOString(),
  });
}

export async function processSosQueue({processors = {}, now = Date.now()} = {}) {
  const state = getConnectivityState();
  const queueBeforeRecovery = await sosLocalStore.getPendingQueue();
  await Promise.all(queueBeforeRecovery
    .filter(item => item.status === 'PROCESSING')
    .map(item => sosLocalStore.updateQueueItem(item.id, {
      status: 'RETRY_WAITING',
      error: 'Recovered after an interrupted queue attempt.',
      nextAttemptAt: new Date(now + PROCESSING_RECOVERY_MS).toISOString(),
    })));
  const priority = {BACKEND: 0, BACKEND_SYNC: 0};
  const queue = (await sosLocalStore.getPendingQueue()).sort(
    (left, right) => (priority[left.type] ?? 1) - (priority[right.type] ?? 1)
  );
  const processed = [];

  for (const item of queue) {
    if (!isEligible(item, state, now) || typeof processors[item.serviceName] !== 'function') continue;
    const event = await sosLocalStore.getSosById(item.sosId);
    if (!event) {
      await sosLocalStore.removeQueueItem(item.id);
      continue;
    }

    const attempts = (item.attempts || 0) + 1;
    await sosLocalStore.updateQueueItem(item.id, {
      status: 'PROCESSING', attempts, lastAttemptAt: new Date(now).toISOString(),
    });

    try {
      const result = await processors[item.serviceName](item, event);
      if (result?.status === 'PENDING') throw new Error(result.reason || 'Service remains pending.');
      const servicePatch = {
        status: result?.status || 'COMPLETED',
        completedAt: new Date().toISOString(),
        ...(result && typeof result === 'object' ? {lastResult: result} : {}),
      };
      await sosLocalStore.updateSosServiceState(event.id, item.serviceName, servicePatch);
      if (result?.backendId) {
        const latestEvent = await sosLocalStore.getSosById(event.id);
        await sosLocalStore.upsertSos({...latestEvent, backendId: result.backendId, emergencyLink: result.emergencyLink || null});
      }
      await sosLocalStore.removeQueueItem(item.id);
      processed.push({id: item.id, status: 'COMPLETED'});
    } catch (error) {
      if (attempts >= MAX_ATTEMPTS) {
        await sosLocalStore.updateQueueItem(item.id, {status: 'FAILED', error: error?.message || 'Queue job failed'});
        processed.push({id: item.id, status: 'FAILED'});
      } else {
        await sosLocalStore.updateQueueItem(item.id, {
          status: 'RETRY_WAITING', error: error?.message || 'Queue job failed',
          nextAttemptAt: new Date(now + BASE_BACKOFF_MS * (2 ** (attempts - 1))).toISOString(),
        });
        processed.push({id: item.id, status: 'RETRY_WAITING'});
      }
    }
  }

  return processed;
}

export default {enqueueSosJob, processSosQueue};