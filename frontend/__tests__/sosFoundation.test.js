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

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

import {activateSosFlow, createSosLocalEvent, generateClientSosId, resolveSosServiceStatus} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {hasLiveLocationExpired, LIVE_LOCATION_MAX_DURATION_MS} from '../src/features/sos/services/liveLocationService';
import {getCurrentLocation} from '../src/features/sos/services/locationService';
import {recoverActiveSosWork} from '../src/features/sos/recovery';
import Geolocation from '@react-native-community/geolocation';

beforeEach(async () => {
  await sosLocalStore.clear();
  connectivityService.resetForTests();
});

test('creates a local SOS event with a unique client ID and initialized services', async () => {
  const event = await createSosLocalEvent({
    userId: 'user-1',
    collectionId: 'collection-1',
  });

  expect(event.id).toMatch(/^sos_/);
  expect(event.status).toBe('ACTIVE');
  expect(event.services.sms.status).toBe('PENDING');
  expect(event.services.backend.status).toBe('PENDING');
  expect(event.services.location.status).toBe('PENDING');
  expect(event.services.camera.status).toBe('PENDING');
});

test('persists queued work and resumes after reload', async () => {
  const first = await createSosLocalEvent({
    userId: 'user-1',
    collectionId: 'collection-1',
  });

  await sosLocalStore.enqueueQueueItem({
    sosId: first.id,
    type: 'BACKEND_SYNC',
    status: 'PENDING',
    attempts: 0,
    createdAt: new Date().toISOString(),
    nextAttemptAt: new Date().toISOString(),
  });

  const persisted = await sosLocalStore.getPendingQueue();
  expect(persisted).toHaveLength(1);

  const reloaded = await sosLocalStore.getSosById(first.id);
  expect(reloaded.id).toBe(first.id);
});

test('orchestrator continues when a service fails', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      sms: async () => { throw new Error('sms failed'); },
      call: async () => 'call okay',
      camera: async () => 'camera okay',
      audio: async () => 'audio okay',
      location: async () => 'location okay',
      backend: async () => 'backend okay',
      email: async () => 'email okay',
      notifications: async () => 'notifications okay',
    },
  });

  expect(result.event.status).toBe('ACTIVE');
  expect(result.event.services.sms.status).toBe('FAILED');
  expect(result.event.services.call.status).toBe('COMPLETED');
  expect(result.event.services.backend.status).toBe('COMPLETED');
});

test('preserves concurrent service results in local storage', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      camera: async () => {
        await new Promise(resolve => setTimeout(resolve, 15));
        return {status: 'COMPLETED', frontImagePath: '/camera.jpg'};
      },
      audio: async () => ({status: 'COMPLETED', localPath: '/audio.m4a'}),
      location: async () => ({status: 'COMPLETED', latitude: 51.5, longitude: -0.12}),
      backend: async () => ({status: 'COMPLETED', backendId: 'backend-1'}),
    },
  });

  const stored = await sosLocalStore.getSosById(result.event.id);
  expect(stored.services.camera.frontImagePath).toBe('/camera.jpg');
  expect(stored.services.audio.localPath).toBe('/audio.m4a');
  expect(stored.services.location.status).toBe('COMPLETED');
  expect(stored.services.backend.status).toBe('COMPLETED');
});

test('persists a pending SOS before countdown activation', async () => {
  const signal = {cancelled: false};
  const onPending = jest.fn(event => {
    expect(event.status).toBe('PENDING');
    signal.cancelled = true;
  });
  const backend = jest.fn();

  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    countdownMs: 250,
    cancelSignal: signal,
    onPending,
    serviceRunners: {backend},
  });

  expect(onPending).toHaveBeenCalledTimes(1);
  expect(result.cancelled).toBe(true);
  expect(backend).not.toHaveBeenCalled();
  expect((await sosLocalStore.getSosById(result.event.id)).status).toBe('CANCELLED');
});

test('waits for async pending setup before dispatching SOS services', async () => {
  let ready = false;

  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    countdownMs: 0,
    onPending: async () => {
      await Promise.resolve();
      ready = true;
    },
    serviceRunners: {
      backend: async () => {
        expect(ready).toBe(true);
        return {status: 'COMPLETED'};
      },
    },
  });

  expect(result.event.services.backend.status).toBe('COMPLETED');
  expect(ready).toBe(true);
});

test('transitions to ACTIVE before the orchestrator dispatches services', async () => {
  const observedStatuses = [];
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    countdownMs: 20,
    serviceRunners: {
      backend: async event => {
        observedStatuses.push(event.status);
        return {status: 'COMPLETED'};
      },
    },
  });

  expect(observedStatuses).toEqual(['ACTIVE']);
  expect(result.event.status).toBe('ACTIVE');
  expect((await sosLocalStore.getSosById(result.event.id)).status).toBe('ACTIVE');
});

test('cancelling during PENDING prevents every service runner from dispatching', async () => {
  const signal = {cancelled: false};
  const runner = jest.fn();
  const resultPromise = activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    countdownMs: 40,
    cancelSignal: signal,
    onPending: () => { signal.cancelled = true; },
    serviceRunners: {backend: runner, sms: runner, call: runner},
  });

  const result = await resultPromise;

  expect(result.cancelled).toBe(true);
  expect(runner).not.toHaveBeenCalled();
  expect(result.event.status).toBe('CANCELLED');
});

test('connectivity service tracks internet and cellular separately', () => {
  connectivityService.updateState({
    isConnected: true,
    isInternetReachable: true,
    isCellularAvailable: false,
  });

  expect(connectivityService.getInternetAvailability()).toBe(true);
  expect(connectivityService.getCellularAvailability()).toBe(false);
  expect(resolveSosServiceStatus('backend', connectivityService.getState())).toBe('READY');
  expect(resolveSosServiceStatus('sms', connectivityService.getState())).toBe('PENDING');
});

test('queue deduplicates jobs and waits for required connectivity', async () => {
  const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});

  expect(await sosLocalStore.getPendingQueue()).toHaveLength(1);
  expect(await processSosQueue({processors: {backend: jest.fn()}})).toHaveLength(0);

  connectivityService.updateState({isConnected: true, isInternetReachable: true});
  const backend = jest.fn(async () => ({status: 'COMPLETED', backendId: 'server-id'}));
  const result = await processSosQueue({processors: {backend}});
  expect(result[0].status).toBe('COMPLETED');
  expect(backend).toHaveBeenCalledTimes(1);
  expect(await sosLocalStore.getPendingQueue()).toHaveLength(0);
});

test('manual SOS waits for backend creation before live-location sharing begins', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      backend: async event => {
        await new Promise(resolve => setTimeout(resolve, 30));
        event.backendId = 'backend-ordered';
        return {status: 'COMPLETED', backendId: 'backend-ordered'};
      },
      location: async () => ({status: 'COMPLETED', latitude: 51.5, longitude: -0.12}),
      camera: async () => ({status: 'COMPLETED', frontImagePath: '/tmp/front.jpg', backImagePath: '/tmp/back.jpg'}),
      audio: async () => ({status: 'COMPLETED', localPath: '/tmp/audio.m4a'}),
      liveLocation: async event => {
        if (!event.backendId) {
          throw new Error('Live location started before backend creation');
        }
        return {status: 'PENDING', reason: 'Live location start is queued until internet returns.'};
      },
      sms: async () => ({status: 'PENDING'}),
      call: async () => ({status: 'PENDING'}),
      email: async () => ({status: 'PENDING'}),
      notifications: async () => ({status: 'PENDING'}),
    },
  });

  expect(result.event.services.backend.status).toBe('COMPLETED');
  expect(result.event.services.liveLocation.status).toBe('PENDING');
  expect(result.event.backendId).toBe('backend-ordered');
});

test('live location expiry is timestamp based and restart safe', () => {
  const startedAt = new Date(2026, 0, 1).toISOString();
  const beforeExpiry = new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS - 1).getTime();
  const afterExpiry = new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS;

  expect(hasLiveLocationExpired(startedAt, beforeExpiry)).toBe(false);
  expect(hasLiveLocationExpired(startedAt, afterExpiry)).toBe(true);
});

test('normalizes a native GPS fix with accuracy and timestamp', async () => {
  Geolocation.getCurrentPosition.mockImplementationOnce(success => success({
    coords: {latitude: 51.5, longitude: -0.12, accuracy: 8},
  }));

  await expect(getCurrentLocation()).resolves.toMatchObject({
    latitude: 51.5,
    longitude: -0.12,
    accuracy: 8,
  });
});

test('requeues interrupted work after app restart recovery', async () => {
  const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  const queued = await sosLocalStore.getPendingQueue();
  await sosLocalStore.updateQueueItem(queued[0].id, {status: 'PROCESSING'});

  connectivityService.updateState({isConnected: true, isInternetReachable: true});
  const processor = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {backend: processor}, now: Date.now()});

  expect(processor).not.toHaveBeenCalled();
  expect((await sosLocalStore.getPendingQueue())[0].status).toBe('RETRY_WAITING');
});

test('startup recovery rebuilds backend work and expires stale live sharing from timestamps', async () => {
  const pending = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
  await sosLocalStore.updateSosServiceState(pending.id, 'backend', {status: 'PENDING'});

  const expired = await createSosLocalEvent({userId: 'user-2', collectionId: 'collection-1'});
  const startedAt = new Date(Date.now() - LIVE_LOCATION_MAX_DURATION_MS - 1).toISOString();
  await sosLocalStore.upsertSos({...expired, liveLocationStartedAt: startedAt, liveLocationStatus: 'ACTIVE'});

  await recoverActiveSosWork();

  expect((await sosLocalStore.getPendingQueue()).some(item => item.id === `${pending.id}:BACKEND`)).toBe(true);
  expect((await sosLocalStore.getSosById(expired.id)).liveLocationStatus).toBe('STOPPED_MAX_DURATION');
});
