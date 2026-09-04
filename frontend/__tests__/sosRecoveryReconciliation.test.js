jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
  },
}));

import {createSosLocalEvent} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {recoverActiveSosWork} from '../src/features/sos/recovery';

beforeEach(async () => {
  await sosLocalStore.clear();
  connectivityService.resetForTests();
});

describe('Problem 1 — offline SOS restart recovery', () => {
  test('concurrent enqueue calls keep one stable queue item', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await Promise.all([
      enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'}),
      enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'}),
    ]);
    const jobs = (await sosLocalStore.getPendingQueue()).filter(item => item.id === `${event.id}:BACKEND`);
    expect(jobs).toHaveLength(1);
  });

  test('PROCESSING jobs are reset for safe restart recovery', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    await sosLocalStore.updateQueueItem(`${event.id}:BACKEND`, {status: 'PROCESSING'});
    await recoverActiveSosWork();
    const job = (await sosLocalStore.getPendingQueue()).find(item => item.id === `${event.id}:BACKEND`);
    expect(job.status).toBe('PENDING');
  });

  test('a recovered PROCESSING job is processed later with the same stable id', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    const jobId = `${event.id}:BACKEND`;
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    await sosLocalStore.updateQueueItem(jobId, {status: 'PROCESSING'});
    await recoverActiveSosWork();

    connectivityService.updateState({isConnected: true, isInternetReachable: true});
    const processor = jest.fn(async () => ({status: 'COMPLETED'}));
    await processSosQueue({processors: {backend: processor}});

    expect(processor).toHaveBeenCalledTimes(1);
    expect(processor.mock.calls[0][0].id).toBe(jobId);
    expect((await sosLocalStore.getPendingQueue()).some(item => item.id === jobId)).toBe(false);
  });

  test('successful service state is not requeued during recovery', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.updateSosServiceState(event.id, 'backend', {status: 'SUCCESS'});
    const recovered = await recoverActiveSosWork();
    expect(recovered.some(item => item.sosId === event.id && item.serviceName === 'backend')).toBe(false);
    expect((await sosLocalStore.getPendingQueue()).some(item => item.localSosId === event.id && item.type === 'BACKEND')).toBe(false);
  });

  test('DEACTIVATED events are not recovered or activated', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, status: 'DEACTIVATED'});
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    const recovered = await recoverActiveSosWork();
    expect(recovered.filter(item => item.sosId === event.id)).toHaveLength(0);
    expect((await sosLocalStore.getSosById(event.id)).status).toBe('DEACTIVATED');
  });

  test('concurrent update and remove operations preserve the final queue state', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    const jobId = `${event.id}:BACKEND`;
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    await Promise.all([
      sosLocalStore.updateQueueItem(jobId, {status: 'RETRY_WAITING', attempts: 1}),
      sosLocalStore.removeQueueItem(jobId),
    ]);
    expect((await sosLocalStore.getPendingQueue()).some(item => item.id === jobId)).toBe(false);
  });

  test('a PENDING (backend-unconfirmed) event is recovered, not skipped', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    expect(event.status).toBe('PENDING');

    await sosLocalStore.updateSosServiceState(event.id, 'backend', {status: 'PENDING'});
    await sosLocalStore.updateSosServiceState(event.id, 'sms', {status: 'PENDING'});

    const recovered = await recoverActiveSosWork();
    const serviceNames = recovered.filter(r => r.sosId === event.id).map(r => r.serviceName);

    expect(serviceNames).toEqual(expect.arrayContaining(['backend', 'sms']));

    const queue = await sosLocalStore.getPendingQueue();
    expect(queue.some(item => item.localSosId === event.id && item.type === 'BACKEND')).toBe(true);
  });

  test('CANCELLED events are never recovered', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, status: 'CANCELLED'});

    const recovered = await recoverActiveSosWork();
    expect(recovered.filter(r => r.sosId === event.id)).toHaveLength(0);
  });

  test('backend confirmation reconciles a PENDING local event to ACTIVE (never fabricated early)', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    expect(event.status).toBe('PENDING');

    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    connectivityService.updateState({isConnected: true, isInternetReachable: true});

    await processSosQueue({
      processors: {
        backend: async () => ({
          status: 'COMPLETED',
          backendId: 'server-id-123',
          emergencyLink: 'https://example.test/e/tok123',
          activatedAt: '2026-01-01T00:00:00.000Z',
        }),
      },
    });

    const reconciled = await sosLocalStore.getSosById(event.id);
    expect(reconciled.status).toBe('ACTIVE');
    expect(reconciled.backendId).toBe('server-id-123');
    expect(reconciled.emergencyLink).toBe('https://example.test/e/tok123');
    expect(reconciled.activatedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  test('a valid location captured before backendId is durably persisted and queued for later delivery', async () => {
    const result = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    const location = {
      status: 'COMPLETED',
      latitude: 12.34,
      longitude: 56.78,
      accuracy: 15,
      capturedAt: '2026-09-03T00:00:00.000Z',
      source: 'gps',
    };

    await sosLocalStore.upsertSos({
      ...result,
      location,
      services: {
        ...result.services,
        location: {status: 'COMPLETED', completedAt: new Date().toISOString(), error: null},
      },
    });

    await enqueueSosJob({sosId: result.id, type: 'LOCATION', serviceName: 'location'});

    const persisted = await sosLocalStore.getSosById(result.id);
    expect(persisted.location.latitude).toBe(12.34);
    expect(persisted.location.longitude).toBe(56.78);
    expect((await sosLocalStore.getPendingQueue()).some(item => item.localSosId === result.id && item.type === 'LOCATION')).toBe(true);
  });

  test('does not resurrect a CANCELLED event even if a stale backend job later succeeds', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, status: 'CANCELLED'});
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    connectivityService.updateState({isConnected: true, isInternetReachable: true});

    await processSosQueue({
      processors: {
        backend: async () => ({status: 'COMPLETED', backendId: 'server-id-999'}),
      },
    });

    const after = await sosLocalStore.getSosById(event.id);
    expect(after.status).toBe('CANCELLED');
  });
});

describe('Problem 2 — durable canonical-link SMS (LINK_SMS)', () => {
  test('a LINK_SMS job is queued immediately at trigger time, before any backend confirmation', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});

    const queue = await sosLocalStore.getPendingQueue();
    const linkJobs = queue.filter(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(linkJobs).toHaveLength(1);
  });

  test('LINK_SMS stays pending (never fails hard) while the link does not exist yet', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: true});

    const linkSmsProcessor = jest.fn(async (item, evt) => {
      if (!evt.emergencyLink) {
        return {status: 'WAITING_FOR_LINK', reason: 'Waiting for the canonical emergency link from the backend.'};
      }
      return {status: 'COMPLETED'};
    });

    await processSosQueue({processors: {linkSms: linkSmsProcessor}});

    expect(linkSmsProcessor).toHaveBeenCalled();
    const queue = await sosLocalStore.getPendingQueue();
    const job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job.status).toBe('WAITING_FOR_LINK');
    expect(job.attempts || 0).toBe(0);
  });

  test('WAITING_FOR_LINK never consumes MAX_ATTEMPTS, no matter how many times it is polled', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: true});

    const linkSmsProcessor = jest.fn(async (item, evt) => {
      if (!evt.emergencyLink) {
        return {status: 'WAITING_FOR_LINK', reason: 'Waiting for the canonical emergency link from the backend.'};
      }
      return {status: 'COMPLETED'};
    });

    // Poll far more than MAX_ATTEMPTS (5) times while the link still does
    // not exist. Before the fix, each PENDING result was treated as a
    // failed delivery attempt and the job would hit FAILED well before
    // this loop finishes.
    let now = Date.now();
    for (let i = 0; i < 20; i += 1) {
      now += 10000; // clear the WAITING_FOR_LINK poll interval each time
      await processSosQueue({processors: {linkSms: linkSmsProcessor}, now});
    }

    expect(linkSmsProcessor).toHaveBeenCalledTimes(20);
    const queue = await sosLocalStore.getPendingQueue();
    const job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job).toBeDefined();
    expect(job.status).toBe('WAITING_FOR_LINK');
    expect(job.attempts || 0).toBe(0);

    // Now the backend produces the link — the very next poll should send
    // and complete the job, proving it was never burned through retries.
    await sosLocalStore.upsertSos({...(await sosLocalStore.getSosById(event.id)), emergencyLink: 'https://example.test/e/tokABC'});
    now += 10000;
    await processSosQueue({processors: {linkSms: linkSmsProcessor}, now});

    const finalQueue = await sosLocalStore.getPendingQueue();
    expect(finalQueue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS')).toBeUndefined();
    const reloaded = await sosLocalStore.getSosById(event.id);
    expect(reloaded.services.linkSms.status).toBe('COMPLETED');
  });

  test('a genuine LINK_SMS send failure (link exists, send throws) still counts toward MAX_ATTEMPTS and eventually fails', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, emergencyLink: 'https://example.test/e/tok999'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: true});

    const linkSmsProcessor = jest.fn(async () => {
      throw new Error('native SMS send failed');
    });

    let now = Date.now();
    for (let i = 0; i < 5; i += 1) {
      now += 10 * 60 * 1000; // clear exponential backoff
      await processSosQueue({processors: {linkSms: linkSmsProcessor}, now});
    }

    const queue = await sosLocalStore.getPendingQueue();
    const job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job.status).toBe('FAILED');
    expect(job.attempts).toBe(5);
  });

  test('LINK_SMS is not attempted while cellular is unavailable, even if the link exists', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, emergencyLink: 'https://example.test/e/tok123'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: false});

    const linkSmsProcessor = jest.fn(async () => ({status: 'COMPLETED'}));
    await processSosQueue({processors: {linkSms: linkSmsProcessor}});

    expect(linkSmsProcessor).not.toHaveBeenCalled();
    const queue = await sosLocalStore.getPendingQueue();
    const job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job.status).toBe('PENDING');
  });

  test('LINK_SMS sends once both the link exists and cellular is available', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, emergencyLink: 'https://example.test/e/tok123'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: true});

    const linkSmsProcessor = jest.fn(async (item, evt) => ({
      status: 'COMPLETED',
      reason: `sent to link ${evt.emergencyLink}`,
    }));
    await processSosQueue({processors: {linkSms: linkSmsProcessor}});

    expect(linkSmsProcessor).toHaveBeenCalledTimes(1);
    const queue = await sosLocalStore.getPendingQueue();
    expect(queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS')).toBeUndefined();
    const reloaded = await sosLocalStore.getSosById(event.id);
    expect(reloaded.services.linkSms.status).toBe('COMPLETED');
  });

  test('LINK_SMS job identity is stable — repeated enqueue calls never create a duplicate job', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    await recoverActiveSosWork(); // simulates an app restart re-deriving pending work

    const queue = await sosLocalStore.getPendingQueue();
    const linkJobs = queue.filter(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(linkJobs).toHaveLength(1);
  });

  test('restart recovery re-deriving a job never resets its attempts/backoff (idempotent enqueue)', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.upsertSos({...event, emergencyLink: 'https://example.test/e/tokXYZ'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
    connectivityService.updateState({isCellularAvailable: true});

    const failingProcessor = jest.fn(async () => {
      throw new Error('native SMS send failed');
    });

    let now = Date.now();
    now += 10 * 60 * 1000;
    await processSosQueue({processors: {linkSms: failingProcessor}, now});

    let queue = await sosLocalStore.getPendingQueue();
    let job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job.attempts).toBe(1);
    expect(job.status).toBe('RETRY_WAITING');

    // Simulate an app restart: recovery re-derives pending work for this
    // still-unfinished service. Before the fix, this merge-overwrote the
    // existing queue item back to {status: 'PENDING', attempts: 0}, silently
    // discarding the real attempt/backoff already recorded above.
    await recoverActiveSosWork();

    queue = await sosLocalStore.getPendingQueue();
    job = queue.find(item => item.localSosId === event.id && item.type === 'LINK_SMS');
    expect(job.attempts).toBe(1);
    expect(job.status).toBe('RETRY_WAITING');
  });

  test('LINK_SMS job survives being re-derived after restart recovery', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});

    // Simulate app restart: recovery re-derives pending work from event state.
    await recoverActiveSosWork();

    const queue = await sosLocalStore.getPendingQueue();
    expect(queue.some(item => item.localSosId === event.id && item.type === 'LINK_SMS')).toBe(true);
  });
});

describe('Problem 3 — no orphan EMAIL/NOTIFICATIONS client queue jobs', () => {
  test('recovery never enqueues EMAIL or NOTIFICATIONS jobs', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await sosLocalStore.updateSosServiceState(event.id, 'email', {status: 'PENDING'});
    await sosLocalStore.updateSosServiceState(event.id, 'notifications', {status: 'PENDING'});

    await recoverActiveSosWork();

    const queue = await sosLocalStore.getPendingQueue();
    expect(queue.some(item => item.type === 'EMAIL')).toBe(false);
    expect(queue.some(item => item.type === 'NOTIFICATIONS')).toBe(false);
  });

  test('a queue with no email/notifications processors never leaves those job types stuck (because none are ever created)', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
    connectivityService.updateState({isConnected: true, isInternetReachable: true});

    // Only a backend processor is registered — mirrors frontend/App.js, which
    // intentionally has no `email`/`notifications` processors because the
    // backend (dispatch.service.js) owns that work end-to-end.
    const processed = await processSosQueue({
      processors: {backend: async () => ({status: 'COMPLETED', backendId: 'server-1'})},
    });

    expect(processed.some(p => p.status === 'FAILED')).toBe(false);
  });
});
