import {sosLocalStore} from './storage';
import {connectivityService} from './connectivity';
import {enqueueSosJob} from './queue/queueWorker';

const RETRYABLE_SERVICES = new Set(['sms', 'call', 'backend', 'email', 'notifications', 'liveLocation']);

export function generateClientSosId() {
  const cryptoRef = (typeof window !== 'undefined' && window.crypto)
    || (typeof global !== 'undefined' && global.crypto)
    || null;

  const random = (cryptoRef && typeof cryptoRef.randomUUID === 'function')
    ? cryptoRef.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `sos_${random.replace(/-/g, '')}`;
}

export function createBaseServiceState() {
  return {
    sms: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    call: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    camera: {status: 'PENDING', frontImagePath: null, backImagePath: null, completedAt: null, error: null},
    audio: {status: 'PENDING', localPath: null, completedAt: null, error: null},
    location: {status: 'PENDING', completedAt: null, error: null},
    liveLocation: {status: 'PENDING', startedAt: null, stoppedAt: null, completedAt: null, error: null},
    backend: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    email: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    notifications: {status: 'PENDING', completedAt: null, error: null},
  };
}

export async function createSosLocalEvent({userId, collectionId, meta = {}}) {
  const event = {
    id: generateClientSosId(),
    userId,
    collectionId,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    status: 'PENDING',
    location: {
      latitude: null,
      longitude: null,
      accuracy: null,
      capturedAt: null,
    },
    services: createBaseServiceState(),
    meta,
  };

  await sosLocalStore.upsertSos(event);
  return event;
}

export function resolveSosServiceStatus(serviceName, networkState) {
  const internetAvailable = Boolean(networkState?.isInternetReachable || networkState?.isConnected);
  const cellularAvailable = Boolean(networkState?.isCellularAvailable);
  const telephonyStatus = networkState?.telephonyStatus || 'TEMPORARILY_UNAVAILABLE';
  const telephonySupported = networkState?.telephonySupported !== false;

  if (serviceName === 'backend' || serviceName === 'email' || serviceName === 'notifications') {
    return internetAvailable ? 'READY' : 'PENDING';
  }

  if (serviceName === 'sms' || serviceName === 'call') {
    if (!cellularAvailable) return 'PENDING';
    if (telephonyStatus === 'TEMPORARILY_UNAVAILABLE') return 'PENDING';
    if (telephonyStatus === 'UNSUPPORTED' || !telephonySupported) return 'UNSUPPORTED';
    if (telephonyStatus === 'FAILED') return 'FAILED';
    return 'READY';
  }

  return 'PENDING';
}

export async function activateSosFlow({userId, collectionId, serviceRunners = {}}) {
  const event = await createSosLocalEvent({userId, collectionId});

  const defaultRunners = {
    sms: async () => 'sms',
    call: async () => 'call',
    camera: async () => 'camera',
    audio: async () => 'audio',
    location: async () => 'location',
    backend: async () => 'backend',
    email: async () => 'email',
    notifications: async () => 'notifications',
    liveLocation: async () => 'liveLocation',
  };

  const runners = {...defaultRunners, ...serviceRunners};
  const executionOrder = ['backend', 'location', 'camera', 'audio', 'sms', 'call', 'notifications', 'liveLocation'];
  const extraNames = Object.keys(runners).filter((name) => !executionOrder.includes(name));
  const names = [...executionOrder.filter(name => Object.prototype.hasOwnProperty.call(runners, name)), ...extraNames];

  const execution = [];
  let backendReady = false;

  for (const serviceName of names) {
    const serviceState = event.services[serviceName];
    try {
      const result = await runners[serviceName](event);
      const resultStatus = result?.status || 'COMPLETED';

      if (serviceName === 'backend') {
        if (resultStatus === 'FAILED') {
          throw new Error(result?.error || result?.reason || 'SOS backend creation failed');
        }
        if (resultStatus === 'COMPLETED' && !result?.backendId) {
          throw new Error(result?.error || result?.reason || 'SOS backend creation did not return a valid backend identifier.');
        }
        if (result?.backendId) {
          event.backendId = result.backendId;
          event.emergencyLink = result.emergencyLink || null;
          backendReady = true;
        }
      }

      const next = {
        ...serviceState,
        status: resultStatus,
        ...(resultStatus === 'COMPLETED' || resultStatus === 'NOT_CONFIGURED'
          ? {completedAt: new Date().toISOString()}
          : {}),
        ...(result && typeof result === 'object' ? {
          lastResult: result,
          ...(result.frontImagePath !== undefined ? {frontImagePath: result.frontImagePath} : {}),
          ...(result.backImagePath !== undefined ? {backImagePath: result.backImagePath} : {}),
          ...(result.localPath !== undefined ? {localPath: result.localPath} : {}),
          ...(result.error !== undefined ? {error: result.error} : {}),
        } : {}),
      };
      if (serviceName === 'location' && result?.latitude != null && result?.longitude != null) {
        event.location = {...event.location, ...result};
      }
      if (serviceName === 'liveLocation' && result?.startedAt) {
        event.liveLocationStartedAt = result.startedAt;
        event.liveLocationStatus = 'ACTIVE';
      }
      event.services[serviceName] = next;
      await sosLocalStore.updateSosServiceState(event.id, serviceName, next);
      if (resultStatus === 'PENDING' && RETRYABLE_SERVICES.has(serviceName)) {
        await enqueueSosJob({sosId: event.id, type: serviceName.toUpperCase(), serviceName});
      }
      execution.push({serviceName, status: resultStatus, result});
    } catch (error) {
      const next = {
        ...serviceState,
        status: 'FAILED',
        error: error?.message || 'Service failed',
        completedAt: new Date().toISOString(),
      };
      event.services[serviceName] = next;
      await sosLocalStore.updateSosServiceState(event.id, serviceName, next);
      if (RETRYABLE_SERVICES.has(serviceName)) {
        await enqueueSosJob({sosId: event.id, type: serviceName.toUpperCase(), serviceName});
      }
      execution.push({serviceName, status: 'FAILED', error: error?.message || 'Service failed'});

      if (serviceName === 'backend') {
        event.status = 'PENDING';
        await sosLocalStore.upsertSos(event);
        return {event, execution};
      }
    }
  }

  event.status = backendReady ? 'ACTIVE' : 'PENDING';
  await sosLocalStore.upsertSos(event);

  // Capture completes locally. Queue the existing upload worker only after
  // the backend record exists, so device paths never become backend URLs.
  if (backendReady && (
    event.services?.camera?.frontImagePath ||
    event.services?.camera?.backImagePath ||
    event.services?.audio?.localPath ||
    event.services?.camera?.status === 'FAILED' ||
    event.services?.audio?.status === 'FAILED'
  )) {
    await enqueueSosJob({
      sosId: event.id,
      backendSosId: event.backendId,
      type: 'MEDIA_UPLOAD',
      serviceName: 'mediaUpload',
    });
  }

  return {event, execution};
}

export default {
  createSosLocalEvent,
  generateClientSosId,
  activateSosFlow,
  resolveSosServiceStatus,
  connectivityService,
};
