import {sosLocalStore} from './storage';
import {connectivityService} from './connectivity';
import {enqueueSosJob} from './queue/queueWorker';

const RETRYABLE_SERVICES = new Set(['sms', 'call', 'backend', 'liveLocation']);

export function generateClientSosId() {
  const nativeCrypto = typeof global !== 'undefined' ? global.crypto : null;
  const random = nativeCrypto?.randomUUID
    ? nativeCrypto.randomUUID()
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

export async function createSosLocalEvent({userId, collectionId, meta = {}, status = 'ACTIVE'}) {
  const event = {
    id: generateClientSosId(),
    userId,
    collectionId,
    createdAt: new Date().toISOString(),
    activatedAt: status === 'ACTIVE' ? new Date().toISOString() : null,
    status,
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

export async function cancelSosLocalEvent(sosId) {
  const event = await sosLocalStore.getSosById(sosId);
  if (!event || event.status !== 'PENDING') return null;
  const cancelled = {...event, status: 'CANCELLED', cancelledAt: new Date().toISOString()};
  await sosLocalStore.upsertSos(cancelled);
  return cancelled;
}

export async function activateLocalSosEvent(event, serviceRunners = {}) {
  const activated = {
    ...event,
    status: 'ACTIVE',
    activatedAt: new Date().toISOString(),
  };
  await sosLocalStore.upsertSos(activated);
  return runSosServices(activated, serviceRunners);
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

export async function activateSosFlow({
  userId,
  collectionId,
  serviceRunners = {},
  countdownMs = 0,
  onPending,
  cancelSignal,
}) {
  const event = await createSosLocalEvent({
    userId,
    collectionId,
    status: countdownMs > 0 ? 'PENDING' : 'ACTIVE',
  });

  await Promise.resolve(onPending?.(event));

  if (countdownMs > 0) {
    const deadline = Date.now() + countdownMs;
    while (Date.now() < deadline) {
      if (cancelSignal?.cancelled) {
        return {event: await cancelSosLocalEvent(event.id), cancelled: true};
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (cancelSignal?.cancelled) {
      return {event: await cancelSosLocalEvent(event.id), cancelled: true};
    }

    event.status = 'ACTIVE';
    event.activatedAt = new Date().toISOString();
    await sosLocalStore.upsertSos(event);
  }

  return runSosServices(event, serviceRunners);
}

export async function runSosServices(event, serviceRunners = {}) {

  const runners = {
    sms: serviceRunners.sms || (async () => ({status: 'PENDING', reason: 'SMS service is not configured.'})),
    call: serviceRunners.call || (async () => ({status: 'PENDING', reason: 'Call service is not configured.'})),
    camera: serviceRunners.camera || (async () => ({status: 'PENDING', reason: 'Camera service is not configured.'})),
    audio: serviceRunners.audio || (async () => ({status: 'PENDING', reason: 'Audio service is not configured.'})),
    location: serviceRunners.location || (async () => ({status: 'PENDING', reason: 'Location service is not configured.'})),
    liveLocation: serviceRunners.liveLocation || (async () => ({status: 'PENDING', reason: 'Live location service is not configured.'})),
    backend: serviceRunners.backend || (async () => ({status: 'PENDING', reason: 'Backend sync service is not configured.'})),
    email: serviceRunners.email || (async () => ({status: 'PENDING', reason: 'Email service is not configured.'})),
    notifications: serviceRunners.notifications || (async () => ({status: 'PENDING', reason: 'Notification service is not configured.'})),
  };

  const serviceOrder = ['backend', 'camera', 'audio', 'location', 'sms', 'call', 'liveLocation', 'email', 'notifications'];
  const names = [...new Set([...serviceOrder.filter(name => Object.prototype.hasOwnProperty.call(runners, name)), ...Object.keys(runners)])];
  const execution = [];

  for (const serviceName of names) {
    const serviceState = event.services[serviceName];
    try {
      const result = await runners[serviceName](event);
      const resultStatus = result?.status || 'COMPLETED';
      const next = {
        ...serviceState,
        ...(result && typeof result === 'object' ? result : {}),
        status: resultStatus,
        ...(result?.error || result?.reason
          ? {error: result.error || result.reason}
          : {}),
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
      if (serviceName === 'liveLocation') {
        if (result?.startedAt) event.liveLocationStartedAt = result.startedAt;
        if (result?.expiresAt) event.liveLocationExpiresAt = result.expiresAt;
        if (resultStatus === 'COMPLETED' || result?.serverStatus === 'active') {
          event.liveLocationStatus = 'ACTIVE';
        }
      }
      event.services[serviceName] = next;
      await sosLocalStore.updateSosServiceState(event.id, serviceName, next);
      if ((serviceName === 'camera' || serviceName === 'audio') && resultStatus === 'COMPLETED') {
        await enqueueSosJob({
          sosId: event.id,
          type: 'MEDIA_UPLOAD',
          serviceName: 'mediaUpload',
        });
      }
      if (resultStatus === 'PENDING' && RETRYABLE_SERVICES.has(serviceName)) {
        await enqueueSosJob({sosId: event.id, type: serviceName.toUpperCase(), serviceName});
      }
      execution.push({serviceName, status: resultStatus});
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
      execution.push({serviceName, status: 'FAILED', error: next.error});
    }
  }

  event.status = 'ACTIVE';
  await sosLocalStore.upsertSos(event);

  return {event, execution};
}

export default {
  createSosLocalEvent,
  generateClientSosId,
  activateSosFlow,
  activateLocalSosEvent,
  cancelSosLocalEvent,
  runSosServices,
  resolveSosServiceStatus,
  connectivityService,
};
