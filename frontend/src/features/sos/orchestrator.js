import {sosLocalStore} from './storage';
import {connectivityService} from './connectivity';
import {enqueueSosJob} from './queue/queueWorker';
import {emitSosToast} from './services/sosToastService';
import {reportServiceResult} from './services/backendSyncService';

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

export async function activateSosFlow({
  userId,
  collectionId,
  serviceRunners = {},
  cancelSignal = null,
  onPending = null,
  countdownMs = null,
} = {}) {
  if (cancelSignal?.cancelled) {
    return {event: null, execution: [], cancelled: true};
  }

  const event = await createSosLocalEvent({userId, collectionId});
  emitSosToast('SOS started', 'info', 2000);
  
  if (typeof onPending === 'function') {
    await onPending(event);
  }

  if (cancelSignal?.cancelled) {
    event.status = 'CANCELLED';
    await sosLocalStore.upsertSos(event);
    return {event, execution: [], cancelled: true};
  }

  const defaultRunners = {
    sms: async () => 'sms',
    call: async () => 'call',
    camera: async () => 'camera',
    audio: async () => 'audio',
    mediaUpload: async () => 'mediaUpload',
    location: async () => 'location',
    backend: async () => 'backend',
    email: async () => 'email',
    notifications: async () => 'notifications',
    liveLocation: async () => 'liveLocation',
  };

  const runners = {...defaultRunners, ...serviceRunners};
  const executionOrder = ['backend', 'location', 'camera', 'audio', 'mediaUpload', 'sms', 'call', 'email', 'notifications', 'liveLocation'];
  const extraNames = Object.keys(runners).filter((name) => !executionOrder.includes(name));
  const names = [...executionOrder.filter(name => Object.prototype.hasOwnProperty.call(runners, name)), ...extraNames];

  const execution = [];
  let backendReady = false;

  if (__DEV__) {
    console.log('SOS_ORCHESTRATOR_STARTED', {names, userId, collectionId, eventId: event.id});
  }

  const runService = async serviceName => {
    const serviceState = event.services[serviceName];
    const tagPrefix = {
      backend: 'SOS_SYNC',
      location: 'SOS_LOCATION',
      camera: 'SOS_CAMERA',
      audio: 'SOS_AUDIO',
      sms: 'SOS_SMS',
      call: 'SOS_CALL',
      notifications: 'SOS_NOTIFICATION',
      liveLocation: 'SOS_LOCATION',
      email: 'SOS_NOTIFICATION',
    }[serviceName] || 'SOS_SERVICE';

    if (__DEV__) {
      console.log(`${tagPrefix}_STARTED`, {eventId: event.id, serviceName});
    }

    try {
      const result = await runners[serviceName](event);
      const resultStatus = result?.status || 'COMPLETED';

      if (__DEV__) {
        console.log(`${tagPrefix}_FINISHED`, {eventId: event.id, serviceName, resultStatus, result});
      }

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
        ...(resultStatus === 'COMPLETED' || resultStatus === 'NOT_CONFIGURED' ? {completedAt: new Date().toISOString()} : {}),
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
      
      // Emit toast for critical services
      if (resultStatus === 'COMPLETED') {
        if (serviceName === 'location') {
          const lat = result?.latitude;
          const lng = result?.longitude;
          const acc = result?.accuracy;
          emitSosToast(`Location acquired (${acc?.toFixed(1) || 'unknown'}m accuracy)`, 'success', 2000);
        } else if (serviceName === 'camera' && result?.frontImagePath) {
          emitSosToast('Front camera captured', 'success', 2000);
        } else if (serviceName === 'camera' && result?.backImagePath) {
          emitSosToast('Back camera captured', 'success', 2000);
        } else if (serviceName === 'audio' && result?.localPath) {
          emitSosToast('Audio recorded (5 seconds)', 'success', 2000);
        }
      } else if (serviceName === 'sms' && resultStatus === 'COMPLETED') {
        emitSosToast('Emergency SMS sent', 'success', 2000);
      } else if (serviceName === 'call' && resultStatus === 'INITIATED') {
        emitSosToast('Emergency call initiated', 'success', 2000);
      }
      
      if (resultStatus === 'PENDING' && RETRYABLE_SERVICES.has(serviceName)) {
        await enqueueSosJob({sosId: event.id, type: serviceName.toUpperCase(), serviceName});
      }

      return {serviceName, status: resultStatus, result};
    } catch (error) {
      if (__DEV__) {
        console.log(`${tagPrefix}_FAILED`, {eventId: event.id, serviceName, error: error?.message || error});
      }

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
      return {serviceName, status: 'FAILED', error: error?.message || 'Service failed'};
    }
  };

  // The backend record is the durability boundary. Capture and dispatch must
  // never race record creation, and push is deliberately the final phase.
  if (names.includes('backend')) {
    execution.push(await runService('backend'));
  }

  const remainingNames = names.filter(name => name !== 'backend');
  const appendSettled = settled => execution.push(...settled.map(result => result.status === 'fulfilled' ? result.value : {
    serviceName: result.reason?.serviceName || 'unknown',
    status: 'FAILED',
    error: result.reason?.message || 'Service failed',
  }));

  // Independent device services run concurrently; media upload waits for
  // captured files and the persisted backend SOS.
  const captureNames = remainingNames.filter(name => ['location', 'camera', 'audio', 'sms', 'call'].includes(name));
  appendSettled(await Promise.allSettled(captureNames.map(serviceName => runService(serviceName))));
  if (remainingNames.includes('mediaUpload')) {
    execution.push(await runService('mediaUpload'));
  }
  const dispatchPreparationNames = remainingNames.filter(name => !['location', 'camera', 'audio', 'sms', 'call', 'mediaUpload', 'notifications', 'liveLocation'].includes(name));
  appendSettled(await Promise.allSettled(dispatchPreparationNames.map(serviceName => runService(serviceName))));

  if (remainingNames.includes('notifications')) {
    execution.push(await runService('notifications'));
  }
  if (remainingNames.includes('liveLocation')) {
    execution.push(await runService('liveLocation'));
  }

  if (cancelSignal?.cancelled) {
    event.status = 'CANCELLED';
    await sosLocalStore.upsertSos(event);
    return {event, execution, cancelled: true, result: {
      call: false,
      sms: false,
      location: false,
      camera: false,
      audio: false,
      upload: false,
      notification: false,
    }};
  }

  event.status = backendReady ? 'ACTIVE' : 'PENDING';
  const summary = {
    call: Boolean(event.services?.call?.status === 'COMPLETED' || event.services?.call?.status === 'INITIATED' || event.services?.call?.status === 'SENT'),
    sms: Boolean(event.services?.sms?.status === 'COMPLETED' || event.services?.sms?.status === 'SENT'),
    location: Boolean(event.services?.location?.status === 'COMPLETED' || (event.location?.latitude != null && event.location?.longitude != null)),
    camera: Boolean(event.services?.camera?.status === 'COMPLETED' || (event.services?.camera?.frontImagePath || event.services?.camera?.backImagePath)),
    audio: Boolean(event.services?.audio?.status === 'COMPLETED' || event.services?.audio?.localPath),
    upload: Boolean(event.services?.camera?.status === 'COMPLETED' || event.services?.audio?.status === 'COMPLETED' || event.services?.backend?.status === 'COMPLETED'),
    notification: Boolean(event.services?.notifications?.status === 'COMPLETED' || event.services?.notifications?.status === 'PENDING'),
  };
  if (__DEV__) {
    console.log('SOS_ACTIVATION_FINISHED', {
      eventId: event.id,
      status: event.status,
      backendReady,
      serviceResults: execution,
      summary,
    });
  }
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

  return {event, execution, result: summary};
}

export default {
  createSosLocalEvent,
  generateClientSosId,
  activateSosFlow,
  resolveSosServiceStatus,
  connectivityService,
};
