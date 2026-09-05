import {sosLocalStore} from '../storage';
import {connectivityService, getConnectivityState} from '../connectivity';
import {SOS_STATES, transitionSosState} from '../stateMachine';
import {isValidLocation} from '../services/locationService';
import {emitSosDiagnostic} from '../services/sosDiagnosticService';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5000;

// A job can be blocked on a prerequisite that has nothing to do with a
// delivery failure — most notably LINK_SMS waiting for the backend to
// generate the canonical emergency link. That is fundamentally different
// from "we tried to send and it didn't go through": no send was attempted,
// so it must never consume MAX_ATTEMPTS (see queueWorker's processing loop
// below). WAITING_FOR_LINK is polled on its own short fixed interval,
// independent of the exponential backoff used for real failures.
const WAITING_FOR_LINK_POLL_MS = 4000;
const processingQueueItems = new Set();
let activeQueueRun = null;

function requiresInternet(item) {
  return ['BACKEND_SYNC', 'BACKEND', 'MEDIA_UPLOAD', 'EMAIL', 'NOTIFICATIONS', 'LIVELOCATION', 'LOCATION'].includes(item.type)
    || item.type.startsWith('MEDIA_UPLOAD:');
}

function requiresCellular(item) {
  // LINK_SMS is an SMS transmission at its core, so it needs cellular just
  // like the first SMS/CALL do. It is intentionally NOT added to
  // requiresInternet: its dependency on the backend-generated link is
  // checked inside the `linkSms` processor itself (frontend/App.js), which
  // returns WAITING_FOR_LINK (never consumes MAX_ATTEMPTS — see above) when
  // the link doesn't exist yet. That keeps "internet-for-the-link" and
  // "cellular-for-the-send" as two
  // independent gates, exactly like the rest of the SMS/CALL vs internet
  // split elsewhere in this file.
  return ['SMS', 'CALL', 'LINK_SMS', 'LOCATION_SMS'].includes(item.type);
}

function isEligible(item, state, now = Date.now()) {
  if (item.status !== 'PENDING' && item.status !== 'RETRY_WAITING' && item.status !== 'WAITING_FOR_LINK') return false;
  if (item.nextAttemptAt && new Date(item.nextAttemptAt).getTime() > now) return false;
  if (requiresInternet(item) && !Boolean(state.isInternetReachable || state.isConnected)) return false;
  if (requiresCellular(item) && !state.isCellularAvailable) return false;
  return true;
}

export async function enqueueSosJob({sosId, backendSosId = null, type, serviceName, payload = {}, idempotencyKey = null}) {
  return sosLocalStore.enqueueQueueItem({
    id: `${sosId}:${type}`,
    localSosId: sosId,
    backendSosId,
    operationType: type,
    type,
    serviceName,
    payload,
    status: 'PENDING',
    attempts: 0,
    idempotencyKey: idempotencyKey || payload.idempotencyKey || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nextAttemptAt: new Date().toISOString(),
  });
}

async function processSosQueueRun({processors = {}, now = Date.now()} = {}) {
  await connectivityService.refreshTelephonyState().catch(() => undefined);
  const state = getConnectivityState();
  const priority = {BACKEND: 0, BACKEND_SYNC: 0};
  const queue = (await sosLocalStore.getPendingQueue()).sort(
    (left, right) => (priority[left.type] ?? 1) - (priority[right.type] ?? 1)
  );
  const processed = [];

  for (const item of queue) {
    const localSosId = item.localSosId || item.sosId;
    if (!localSosId) continue;
    if (!isEligible(item, state, now) || typeof processors[item.serviceName] !== 'function') continue;
    if (processingQueueItems.has(item.id)) continue;
    const event = await sosLocalStore.getSosById(localSosId);
    if (!event) {
      await sosLocalStore.removeQueueItem(item.id);
      continue;
    }
    if (item.type.startsWith('MEDIA_UPLOAD:') && !event.backendId) {
      continue;
    }
    if (['LOCATION', 'LIVELOCATION'].includes(item.type) && !event.backendId) {
      continue;
    }

    // Mark the item as in-flight without touching `attempts` yet — whether
    // this run actually counts as a delivery attempt is only known once the
    // processor returns (see WAITING_FOR_LINK handling below). This also
    // guards against a second, concurrently-triggered processSosQueue run
    // picking up the same item (isEligible only matches PENDING/
    // RETRY_WAITING/WAITING_FOR_LINK, never PROCESSING).
    processingQueueItems.add(item.id);
    await sosLocalStore.updateQueueItem(item.id, {
      status: 'PROCESSING',
      lastAttemptAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
    emitSosDiagnostic(`SOS DEBUG STARTUP 07: Executing job type=${item.type || 'unknown'} status=${item.status || 'unknown'} Job ID=${item.id} Retry count=${item.attempts || 0} Local SOS ID=${localSosId}`);

    try {
      const result = await processors[item.serviceName](item, event);

      if (result?.status === 'WAITING_FOR_LINK') {
        // The backend has not produced the canonical emergency link yet.
        // This is not a delivery failure — no SMS send was attempted — so
        // `attempts` is left exactly as it was and MAX_ATTEMPTS is never
        // consumed while merely waiting. Poll again shortly on a fixed
        // interval, independent of the exponential retry backoff used for
        // real send failures below.
        await sosLocalStore.updateQueueItem(item.id, {
          status: 'WAITING_FOR_LINK',
          error: null,
          waitReason: result.reason || 'Waiting for the canonical emergency link from the backend.',
          updatedAt: new Date(now).toISOString(),
          nextAttemptAt: new Date(now + WAITING_FOR_LINK_POLL_MS).toISOString(),
        });
        processed.push({id: item.id, status: 'WAITING_FOR_LINK'});
        processingQueueItems.delete(item.id);
        continue;
      }

      if (result?.status === 'PENDING') {
        if (item.type.startsWith('MEDIA_UPLOAD:') && !event.backendId) {
          await sosLocalStore.updateQueueItem(item.id, {
            status: 'PENDING',
            error: null,
            nextAttemptAt: null,
            updatedAt: new Date(now).toISOString(),
          });
          processed.push({id: item.id, status: 'PENDING'});
          processingQueueItems.delete(item.id);
          continue;
        }
        throw new Error(result.reason || 'Service remains pending.');
      }
      const servicePatch = {
        status: result?.status || 'COMPLETED',
        completedAt: new Date().toISOString(),
        ...(result && typeof result === 'object' ? {lastResult: result} : {}),
      };
      await sosLocalStore.updateSosServiceState(event.id, item.serviceName, servicePatch);
      if (item.serviceName === 'liveLocation' && result?.status === 'COMPLETED') {
        const latestEvent = await sosLocalStore.getSosById(event.id);
        if (latestEvent) {
          await sosLocalStore.upsertSos({
            ...latestEvent,
            liveLocationStartedAt: result.startedAt || latestEvent.liveLocationStartedAt || null,
            liveLocationStatus: 'ACTIVE',
          });
        }
      }
      if (result?.backendId) {
        const latestEvent = await sosLocalStore.getSosById(event.id);
        // Reconcile local state with the backend, which remains the
        // authoritative source of truth for SOS status. This is the same
        // promotion activateSosFlow performs when backend succeeds
        // synchronously (Case 1/2) — here it's the delayed-confirmation
        // path (Case 3/4, or any retry after an app restart), so a locally
        // PENDING event that was created offline gets promoted to ACTIVE
        // the moment backend actually confirms it, instead of staying
        // PENDING forever. We never fabricate ACTIVE ourselves — we only
        // ever copy what the backend reported (result.serverStatus /
        // result.activatedAt), defaulting to ACTIVE only because a
        // successful createSos response IS the backend's confirmation.
        const activation = transitionSosState(latestEvent, SOS_STATES.ACTIVE);
        const syncedEvent = {
          ...latestEvent,
          backendId: result.backendId,
          emergencyLink: result.emergencyLink || null,
          ...(activation.ok ? activation.event : {}),
          activatedAt: result.activatedAt || latestEvent.activatedAt || new Date().toISOString(),
        };
        await sosLocalStore.upsertSos(syncedEvent);
        if (item.serviceName === 'backend' && isValidLocation(syncedEvent.location)) {
          await enqueueSosJob({sosId: event.id, type: 'LOCATION', serviceName: 'location'});
        }
        if (item.serviceName === 'backend' && syncedEvent.emergencyLink) {
          // Backend recovery path: make sure the tracking-link SMS is queued
          // even when the original direct SOS activation happened offline.
          await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
        }
        if (
          syncedEvent.services?.camera?.frontImagePath ||
          syncedEvent.services?.camera?.backImagePath ||
          syncedEvent.services?.audio?.localPath ||
          syncedEvent.services?.camera?.status === 'FAILED' ||
          syncedEvent.services?.audio?.status === 'FAILED'
        ) {
          for (const component of ['frontImage', 'backImage', 'audio']) {
            await enqueueSosJob({
              sosId: event.id,
              backendSosId: result.backendId,
              type: `MEDIA_UPLOAD:${component}`,
              serviceName: 'mediaUpload',
              payload: {component},
            });
          }
        }
      }
      await sosLocalStore.removeQueueItem(item.id);
      processed.push({id: item.id, status: 'COMPLETED'});
      processingQueueItems.delete(item.id);
    } catch (error) {
      // A real send attempt was made (or the processor threw for some other
      // transient reason) — this is what actually consumes MAX_ATTEMPTS.
      const attempts = (item.attempts || 0) + 1;
      if (item.type === 'BACKEND' || item.type === 'BACKEND_SYNC') {
        emitSosDiagnostic(`SOS DEBUG QUEUE FAILURE: type=${item.type} Job ID=${item.id} Local SOS ID=${localSosId} attempt=${attempts} status=${error?.status || 0} message=${error?.message || 'Queue job failed'}`, 'error');
      }
      if (attempts >= MAX_ATTEMPTS) {
        await sosLocalStore.updateQueueItem(item.id, {
          status: 'FAILED',
          attempts,
          error: error?.message || 'Queue job failed',
          updatedAt: new Date(now).toISOString(),
        });
        processed.push({id: item.id, status: 'FAILED'});
      } else {
        await sosLocalStore.updateQueueItem(item.id, {
          status: 'RETRY_WAITING',
          attempts,
          error: error?.message || 'Queue job failed',
          updatedAt: new Date(now).toISOString(),
          nextAttemptAt: new Date(now + BASE_BACKOFF_MS * (2 ** (attempts - 1))).toISOString(),
        });
        processed.push({id: item.id, status: 'RETRY_WAITING'});
      }
      processingQueueItems.delete(item.id);
    } finally {
      processingQueueItems.delete(item.id);
    }
  }

  return processed;
}

export function processSosQueue(options = {}) {
  if (activeQueueRun) return activeQueueRun;
  activeQueueRun = processSosQueueRun(options).finally(() => {
    activeQueueRun = null;
  });
  return activeQueueRun;
}

export default {enqueueSosJob, processSosQueue};