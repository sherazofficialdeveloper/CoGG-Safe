import {sosLocalStore} from './storage';
import {enqueueSosJob} from './queue/queueWorker';
import {hasLiveLocationExpired} from './services/liveLocationService';
import {emitSosDiagnostic} from './services/sosDiagnosticService';

const RECOVERABLE_SERVICES = {
  sms: 'SMS',
  call: 'CALL',
  backend: 'BACKEND',
  location: 'LOCATION',
  camera: 'CAMERA',
  audio: 'AUDIO',
  liveLocation: 'LIVELOCATION',
  // Durable canonical-link follow-up SMS (see orchestrator.js /
  // queueWorker.js). Included here as a safety net so recovery also
  // guarantees this job exists after a restart; enqueueSosJob is
  // idempotent (stable {sosId}:{type} key) so this never creates a
  // duplicate for an SOS that already has the job queued or completed.
  linkSms: 'LINK_SMS',
  // email/notifications are intentionally NOT recovered here: they are a
  // server-side responsibility (backend/src/modules/sos/dispatch.service.js)
  // dispatched automatically once the backend SOS is created/activated.
  // The client has no queue processor for them (see frontend/App.js), so
  // enqueuing them would only create orphaned queue rows that never clear.
};

// Terminal/local-only statuses that can never represent unfinished work.
// Everything else — including PENDING, which previously caused an SOS
// triggered while fully offline to be skipped by recovery forever — is
// still an active emergency that may have unfinished durable jobs.
const NON_RECOVERABLE_STATUSES = new Set(['CANCELLED', 'DEACTIVATED']);

/**
 * Rebuilds durable work from persisted SOS records after a restart. This is
 * intentionally idempotent: enqueueSosJob uses a stable SOS/type key, so
 * recovery cannot create a second dispatch job for the same component.
 *
 * Recovers both ACTIVE and PENDING events. PENDING here specifically means
 * "backend has not yet confirmed this SOS" (e.g. it was triggered fully
 * offline) — it is still a real, unfinished emergency, not a draft. The
 * backend remains the sole authority that ever promotes an event to
 * ACTIVE; this function only re-queues work, it never sets that field.
 */
export async function recoverActiveSosWork(now = Date.now()) {
  const events = await sosLocalStore.getAllEvents();
  const recovered = [];
  const queue = await sosLocalStore.getPendingQueue();
  emitSosDiagnostic(`SOS DEBUG STARTUP 03: Pending jobs found = ${queue.length}`);
  const backendJobs = queue.filter(item => item.type === 'BACKEND' || item.type === 'BACKEND_SYNC');
  emitSosDiagnostic(`SOS DEBUG STARTUP SUMMARY: events=${events.length} backendJobs=${backendJobs.length} backendLocalSOSIds=${backendJobs.map(item => item.localSosId || item.sosId || 'unknown').join(',') || 'none'}`);
  for (const item of queue) {
    emitSosDiagnostic(`SOS DEBUG STARTUP 04: Job type=${item.type || 'unknown'} Job ID=${item.id || 'unknown'} Retry count=${item.attempts || 0} Local SOS ID=${item.localSosId || item.sosId || 'unknown'}`);
    if (item.status === 'PROCESSING') {
      await sosLocalStore.updateQueueItem(item.id, {
        status: 'PENDING',
        nextAttemptAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      });
    }
  }

  for (const event of events) {
    if (NON_RECOVERABLE_STATUSES.has(event.status)) continue;

    const isExpired = event.liveLocationStartedAt
      ? hasLiveLocationExpired(event.liveLocationStartedAt, now)
      : false;

    if (isExpired) {
      await sosLocalStore.updateSosServiceState(event.id, 'liveLocation', {
        ...(event.services?.liveLocation || {}),
        status: 'STOPPED_MAX_DURATION',
        stoppedAt: new Date(now).toISOString(),
      });
      await sosLocalStore.upsertSos({...event, liveLocationStatus: 'STOPPED_MAX_DURATION'});
      recovered.push({sosId: event.id, action: 'LIVE_LOCATION_EXPIRED'});
      continue;
    }

    // Queue storage is durable but intentionally simple. Enqueue serially so
    // two restart-recovery jobs can never both read the same old queue and
    // overwrite each other with competing writes.
    for (const [serviceName, type] of Object.entries(RECOVERABLE_SERVICES)) {
      const status = event.services?.[serviceName]?.status;
      const permanentlyFailed = event.services?.[serviceName]?.lastResult?.permanent === true;
      if (!permanentlyFailed
        && (status === 'PENDING' || status === 'FAILED' || status === 'RETRY_WAITING' || status === 'PROCESSING')) {
        emitSosDiagnostic(`SOS DEBUG STARTUP 05: Recovered job type=${type} Job ID=${event.id}:${type} Retry count=${event.services?.[serviceName]?.attempts || 0} Local SOS ID=${event.id}`);
        await enqueueSosJob({sosId: event.id, type, serviceName});
        recovered.push({sosId: event.id, serviceName});
      }
    }
    if (
      event.services?.camera?.frontImagePath ||
      event.services?.camera?.backImagePath ||
      event.services?.audio?.localPath ||
      event.services?.camera?.status === 'FAILED' ||
      event.services?.audio?.status === 'FAILED'
    ) {
      for (const component of ['frontImage', 'backImage', 'audio']) {
        await enqueueSosJob({
          sosId: event.id,
          backendSosId: event.backendId || null,
          type: `MEDIA_UPLOAD:${component}`,
          serviceName: 'mediaUpload',
          payload: {component},
        });
      }
    }
  }
  return recovered;
}

export default {recoverActiveSosWork};
