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

import {activateSosFlow, createSosLocalEvent, generateClientSosId, resolveSosServiceStatus} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {hasLiveLocationExpired, LIVE_LOCATION_MAX_DURATION_MS} from '../src/features/sos/services/liveLocationService';

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

test('live location expiry is timestamp based and restart safe', () => {
  const startedAt = new Date(2026, 0, 1).toISOString();
  const beforeExpiry = new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS - 1).getTime();
  const afterExpiry = new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS;

  expect(hasLiveLocationExpired(startedAt, beforeExpiry)).toBe(false);
  expect(hasLiveLocationExpired(startedAt, afterExpiry)).toBe(true);
});
