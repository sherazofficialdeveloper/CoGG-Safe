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
  default: {addEventListener: jest.fn(() => () => {})},
}));

import {createSosLocalEvent} from '../src/features/sos/orchestrator';
import {connectivityService} from '../src/features/sos/connectivity';
import {sosLocalStore} from '../src/features/sos/storage';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {recoverActiveSosWork} from '../src/features/sos/recovery';

const internet = () => connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
const cellularOnly = () => connectivityService.updateState({isConnected: false, isInternetReachable: false, isCellularAvailable: true});
const onlineNoCellular = () => connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: false});
const flush = () => new Promise(resolve => setImmediate(resolve));

beforeEach(async () => {
  await sosLocalStore.clear();
  connectivityService.resetForTests();
});

test('pending backend work is durable in the existing storage queue', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  expect((await sosLocalStore.getPendingQueue()).map(item => item.id)).toEqual([`${event.id}:BACKEND`]);
  expect(require('@react-native-async-storage/async-storage').default.setItem).toHaveBeenCalled();
});

test('offline internet work stays pending without being attempted', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  const processor = jest.fn();
  expect(await processSosQueue({processors: {backend: processor}})).toEqual([]);
  expect(processor).not.toHaveBeenCalled();
});

test('cellular-only connectivity permits SMS work while backend waits', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'SMS', serviceName: 'sms'});
  cellularOnly();
  const sms = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {sms}});
  expect(sms).toHaveBeenCalledTimes(1);
});

test('internet-only connectivity permits backend work while SMS waits', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  onlineNoCellular();
  const backend = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {backend}});
  expect(backend).toHaveBeenCalledTimes(1);
});

test('fully unavailable connectivity preserves all queued work', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  await enqueueSosJob({sosId: event.id, type: 'SMS', serviceName: 'sms'});
  await processSosQueue({processors: {backend: jest.fn(), sms: jest.fn()}});
  expect((await sosLocalStore.getPendingQueue())).toHaveLength(2);
});

test('repeated enqueue keeps one logical job', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await Promise.all(Array.from({length: 5}, () => enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'})));
  expect((await sosLocalStore.getPendingQueue()).filter(item => item.id === `${event.id}:BACKEND`)).toHaveLength(1);
});

test('concurrent queue runs share one controlled processing cycle', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  let release;
  const processor = jest.fn(() => new Promise(resolve => { release = resolve; }));
  const first = processSosQueue({processors: {backend: processor}});
  await flush();
  const second = processSosQueue({processors: {backend: processor}});
  release({status: 'COMPLETED'});
  await Promise.all([first, second]);
  expect(processor).toHaveBeenCalledTimes(1);
});

test('temporary failure is persisted as retry waiting with bounded backoff', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  const now = Date.now();
  await processSosQueue({processors: {backend: async () => { throw new Error('temporary'); }}, now});
  const job = (await sosLocalStore.getPendingQueue())[0];
  expect(job).toMatchObject({status: 'RETRY_WAITING', attempts: 1, error: 'temporary'});
  expect(new Date(job.nextAttemptAt).getTime()).toBe(now + 5000);
});

test('retry backoff prevents an early second attempt', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  const processor = jest.fn(async () => { throw new Error('temporary'); });
  await processSosQueue({processors: {backend: processor}});
  await processSosQueue({processors: {backend: processor}});
  expect(processor).toHaveBeenCalledTimes(1);
});

test('fifth failure becomes terminal FAILED', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  const processor = jest.fn(async () => { throw new Error('permanent'); });
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sosLocalStore.updateQueueItem(`${event.id}:BACKEND`, {status: 'PENDING', nextAttemptAt: null});
    await processSosQueue({processors: {backend: processor}});
  }
  expect((await sosLocalStore.getPendingQueue())[0]).toMatchObject({status: 'FAILED', attempts: 5});
});

test('successful work is removed and never retried', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await sosLocalStore.upsertSos({...event, services: {...event.services, camera: {frontImagePath: 'front.jpg'}}});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  const processor = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {backend: processor}});
  await processSosQueue({processors: {backend: processor}});
  expect(processor).toHaveBeenCalledTimes(1);
  expect(await sosLocalStore.getPendingQueue()).toHaveLength(0);
});

test('stale PROCESSING work is reset during restart recovery', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  await sosLocalStore.updateQueueItem(`${event.id}:BACKEND`, {status: 'PROCESSING'});
  await recoverActiveSosWork();
  expect((await sosLocalStore.getPendingQueue())[0].status).toBe('PENDING');
});

test('restart recovery reprocesses pending work with the same identity', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  await recoverActiveSosWork();
  internet();
  const processor = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {backend: processor}});
  expect(processor.mock.calls[0][0].id).toBe(`${event.id}:BACKEND`);
});

test('backend confirmation enables media jobs on the next controlled cycle', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await sosLocalStore.upsertSos({...event, services: {...event.services, camera: {frontImagePath: 'front.jpg'}}});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  await processSosQueue({processors: {backend: async () => ({status: 'COMPLETED', backendId: 'b1'})}});
  const media = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {mediaUpload: media}});
  expect(media.mock.calls[0][0].payload.component).toBe('frontImage');
});

test('location before backendId remains queued rather than lost', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await sosLocalStore.upsertSos({...event, location: {latitude: 1, longitude: 2}});
  await enqueueSosJob({sosId: event.id, type: 'LOCATION', serviceName: 'location'});
  internet();
  const location = jest.fn();
  await processSosQueue({processors: {location}});
  expect(location).not.toHaveBeenCalled();
  expect((await sosLocalStore.getPendingQueue())[0].status).toBe('PENDING');
});

test('front, back and audio media jobs remain independently identifiable', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await sosLocalStore.upsertSos({...event, backendId: 'b1', services: {...event.services, camera: {frontImagePath: 'f', backImagePath: 'b'}, audio: {localPath: 'a'}}});
  for (const component of ['frontImage', 'backImage', 'audio']) await enqueueSosJob({sosId: event.id, type: `MEDIA_UPLOAD:${component}`, serviceName: 'mediaUpload', payload: {component}});
  internet();
  const media = jest.fn(async item => ({status: item.payload.component === 'backImage' ? 'FAILED' : 'COMPLETED'}));
  await processSosQueue({processors: {mediaUpload: media}});
  expect(media).toHaveBeenCalledTimes(3);
});

test('backend failure does not block SMS processing', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  await enqueueSosJob({sosId: event.id, type: 'SMS', serviceName: 'sms'});
  internet();
  const sms = jest.fn(async () => ({status: 'COMPLETED'}));
  await processSosQueue({processors: {backend: async () => { throw new Error('down'); }, sms}});
  expect(sms).toHaveBeenCalledTimes(1);
});

test('SMS #1 and emergency-link SMS use separate durable identities', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'SMS', serviceName: 'sms'});
  await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
  const ids = (await sosLocalStore.getPendingQueue()).map(item => item.id);
  expect(ids).toEqual(expect.arrayContaining([`${event.id}:SMS`, `${event.id}:LINK_SMS`]));
});

test('link SMS waits without consuming retry attempts when the link is absent', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});
  cellularOnly();
  await processSosQueue({processors: {linkSms: async () => ({status: 'WAITING_FOR_LINK'})}});
  expect((await sosLocalStore.getPendingQueue())[0]).toMatchObject({status: 'WAITING_FOR_LINK', attempts: 0});
});

test('call work is attempted once and successful call is terminal', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'CALL', serviceName: 'call'});
  cellularOnly();
  const call = jest.fn(async () => ({status: 'INITIATED'}));
  await processSosQueue({processors: {call}});
  await processSosQueue({processors: {call}});
  expect(call).toHaveBeenCalledTimes(1);
});

test('authentication failure preserves the local SOS and records retry state', async () => {
  const event = await createSosLocalEvent({userId: 'u', collectionId: 'c'});
  await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});
  internet();
  await processSosQueue({processors: {backend: async () => { throw new Error('Unauthorized'); }}});
  expect(await sosLocalStore.getSosById(event.id)).not.toBeNull();
  expect((await sosLocalStore.getPendingQueue())[0].status).toBe('RETRY_WAITING');
});
