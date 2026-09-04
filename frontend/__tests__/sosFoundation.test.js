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

test('creates a local SOS event with a unique client ID and keeps backend lifecycle pending until confirmed', async () => {
  const event = await createSosLocalEvent({
    userId: 'user-1',
    collectionId: 'collection-1',
  });

  expect(event.id).toMatch(/^sos_/);
  expect(event.status).toBe('PENDING');
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
      backend: async () => ({status: 'COMPLETED', backendId: 'backend-1'}),
      email: async () => 'email okay',
      notifications: async () => 'notifications okay',
    },
  });

  expect(result.event.status).toBe('ACTIVE');
  expect(result.event.services.sms.status).toBe('FAILED');
  expect(result.event.services.call.status).toBe('COMPLETED');
  expect(result.event.services.backend.status).toBe('COMPLETED');
});

test('location failure does not block backend creation, SMS, call, camera or audio', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      backend: async () => ({status: 'COMPLETED', backendId: 'backend-guard'}),
      sms: async () => ({status: 'COMPLETED', sentCount: 2}),
      call: async () => ({status: 'INITIATED'}),
      camera: async () => ({status: 'COMPLETED', frontImagePath: '/tmp/front.jpg', backImagePath: '/tmp/back.jpg'}),
      audio: async () => ({status: 'COMPLETED', localPath: '/tmp/audio.m4a'}),
      location: async () => ({status: 'FAILED', error: 'No location provider available'}),
    },
  });

  expect(result.event.status).toBe('ACTIVE');
  expect(result.event.services.backend.status).toBe('COMPLETED');
  expect(result.event.services.sms.status).toBe('COMPLETED');
  expect(result.event.services.call.status).toBe('INITIATED');
  expect(result.event.services.camera.status).toBe('COMPLETED');
  expect(result.event.services.audio.status).toBe('COMPLETED');
  expect(result.event.services.location.status).toBe('FAILED');
});

test('backend validation failure remains a pending SOS service error', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      backend: async () => ({status: 'FAILED', error: 'Validation failed'}),
      location: async () => 'location okay',
    },
  });

  expect(result.event.status).toBe('PENDING');
  expect(result.event.services.backend.status).toBe('FAILED');
  expect(result.event.services.backend.error).toBe('Validation failed');
});

test('connectivity service tracks internet, cellular and telephony separately', () => {
  connectivityService.updateState({
    isConnected: true,
    isInternetReachable: true,
    isCellularAvailable: false,
    telephonyStatus: 'TEMPORARILY_UNAVAILABLE',
    telephonySupported: false,
  });

  expect(connectivityService.getInternetAvailability()).toBe(true);
  expect(connectivityService.getCellularAvailability()).toBe(false);
  expect(connectivityService.getTelephonyStatus()).toBe('TEMPORARILY_UNAVAILABLE');
  expect(connectivityService.isTelephonySupported()).toBe(false);
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

test('backend creation obtains an id before dependent operations continue', async () => {
  const result = await activateSosFlow({
    userId: 'user-1',
    collectionId: 'collection-1',
    serviceRunners: {
      backend: async () => ({status: 'COMPLETED', backendId: 'backend-123'}),
      location: async (event) => ({
        status: 'COMPLETED',
        latitude: 1,
        longitude: 2,
        capturedAt: new Date().toISOString(),
        backendId: event.backendId,
      }),
      camera: async () => ({status: 'COMPLETED', frontImagePath: '/front.jpg', backImagePath: '/back.jpg'}),
      audio: async () => ({status: 'COMPLETED', localPath: '/audio.m4a'}),
      sms: async () => ({status: 'PENDING', reason: 'Cellular unavailable'}),
      call: async () => ({status: 'PENDING', reason: 'Cellular unavailable'}),
      notifications: async () => ({status: 'PENDING', reason: 'Queued'}),
      liveLocation: async (event) => ({status: 'COMPLETED', backendId: event.backendId, startedAt: new Date().toISOString()}),
    },
  });

  expect(result.event.backendId).toBe('backend-123');
  expect(result.event.services.location.status).toBe('COMPLETED');
  expect(result.event.services.sms.status).toBe('PENDING');
  expect(result.event.services.call.status).toBe('PENDING');
});

test('live location expiry is timestamp based and restart safe', () => {
  const startedAt = new Date(2026, 0, 1).toISOString();
  const beforeExpiry = new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS - 1).getTime();
  const afterExpiry = new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS;

  expect(hasLiveLocationExpired(startedAt, beforeExpiry)).toBe(false);
  expect(hasLiveLocationExpired(startedAt, afterExpiry)).toBe(true);
});
