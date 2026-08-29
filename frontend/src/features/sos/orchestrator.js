import {sosLocalStore} from './storage';
import {connectivityService} from './connectivity';
import {enqueueSosJob} from './queue/queueWorker';

const RETRYABLE_SERVICES = new Set(['sms', 'call', 'backend', 'email', 'notifications', 'liveLocation']);

export function generateClientSosId() {
  const random = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
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
    activatedAt: new Date().toISOString(),
    status: 'ACTIVE',
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
  const internetAvailable = Boolean(networkState?.isInternetReachable);
  const cellularAvailable = Boolean(networkState?.isCellularAvailable);

  if (serviceName === 'backend' || serviceName === 'email' || serviceName === 'notifications') {
    return internetAvailable ? 'READY' : 'PENDING';
  }

  if (serviceName === 'sms' || serviceName === 'call') {
    return cellularAvailable ? 'READY' : 'PENDING';
  }

  return 'PENDING';
}

export async function activateSosFlow({userId, collectionId, serviceRunners = {}}) {
  const event = await createSosLocalEvent({userId, collectionId});

  const runners = {
    sms: serviceRunners.sms || (async () => 'sms'),
    call: serviceRunners.call || (async () => 'call'),
    camera: serviceRunners.camera || (async () => 'camera'),
    audio: serviceRunners.audio || (async () => 'audio'),
    location: serviceRunners.location || (async () => 'location'),
    backend: serviceRunners.backend || (async () => 'backend'),
    email: serviceRunners.email || (async () => 'email'),
    notifications: serviceRunners.notifications || (async () => 'notifications'),
  };

  const names = Object.keys(runners);
  const execution = await Promise.all(
    names.map(async (serviceName) => {
      const serviceState = event.services[serviceName];
      try {
        const result = await runners[serviceName](event);
        const resultStatus = result?.status || 'COMPLETED';
        const next = {
          ...serviceState,
          status: resultStatus,
          ...(resultStatus === 'COMPLETED' || resultStatus === 'NOT_CONFIGURED'
            ? {completedAt: new Date().toISOString()}
            : {}),
          ...(result && typeof result === 'object' ? { lastResult: result } : {}),
        };
        if (serviceName === 'location' && result?.latitude != null && result?.longitude != null) {
          event.location = {...event.location, ...result};
        }
        if (serviceName === 'backend' && result?.backendId) {
          event.backendId = result.backendId;
          event.emergencyLink = result.emergencyLink || null;
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
      }
    })
  );

  event.status = 'ACTIVE';
  await sosLocalStore.upsertSos(event);

  return {event, execution};
}

export default {
  createSosLocalEvent,
  generateClientSosId,
  activateSosFlow,
  resolveSosServiceStatus,
  connectivityService,
};
