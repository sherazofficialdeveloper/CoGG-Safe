import {sosLocalStore} from './storage';
import {enqueueSosJob} from './queue/queueWorker';
import {hasLiveLocationExpired} from './services/liveLocationService';

const RECOVERABLE_SERVICES = {
  sms: 'SMS',
  call: 'CALL',
  backend: 'BACKEND',
  email: 'EMAIL',
  notifications: 'NOTIFICATIONS',
  liveLocation: 'LIVELOCATION',
};

/**
 * Rebuilds durable work from persisted SOS records after a restart. This is
 * intentionally idempotent: enqueueSosJob uses a stable SOS/type key, so
 * recovery cannot create a second dispatch job for the same component.
 */
export async function recoverActiveSosWork(now = Date.now()) {
  const events = await sosLocalStore.getAllEvents();
  const recovered = [];

  for (const event of events) {
    if (event.status !== 'ACTIVE') continue;

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
