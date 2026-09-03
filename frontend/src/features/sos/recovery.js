import {sosLocalStore} from './storage';
import {enqueueSosJob} from './queue/queueWorker';
import {hasLiveLocationExpired} from './services/liveLocationService';

const RECOVERABLE_SERVICES = {
  sms: 'SMS',
  call: 'CALL',
  backend: 'BACKEND',
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
      if (status === 'PENDING' || status === 'FAILED' || status === 'RETRY_WAITING') {
        await enqueueSosJob({sosId: event.id, type, serviceName});
        recovered.push({sosId: event.id, serviceName});
      }
    }
  }
  return recovered;
}

export default {recoverActiveSosWork};
