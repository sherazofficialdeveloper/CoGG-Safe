import {sosLocalStore} from './storage';
import {SOS_STATES, transitionSosState} from './stateMachine';
import {connectivityService} from './connectivity';
import {enqueueSosJob} from './queue/queueWorker';
import {emitSosToast} from './services/sosToastService';
import {reportServiceResult} from './services/backendSyncService';
import {reportSosServiceError} from './services/sosErrorReporter';
import {isValidLocation} from './services/locationService';
import {emitSosDiagnostic} from './services/sosDiagnosticService';

// email/notifications are intentionally NOT retryable client-side jobs:
// their real dispatch is a server-side responsibility
// (backend/src/modules/sos/dispatch.service.js), triggered automatically
// when the backend SOS is created/activated. Enqueuing them here as client
// jobs would create queue entries no processor ever consumes (see
// frontend/App.js processSosQueue processors) — the client only tracks
// their status locally for display, it never owns their retry.
// 'camera' is retryable so a single failed lens (front OR back — see
// cameraService.js's 'PENDING' status for a partial front/back result) gets
// picked up again by queueWorker's 'camera' processor (App.js), which
// re-captures only the missing lens instead of the whole pair.
const RETRYABLE_SERVICES = new Set(['sms', 'call', 'backend', 'location', 'liveLocation', 'camera', 'audio']);

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
    sms: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null, recipients: []},
    call: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    camera: {status: 'PENDING', frontImagePath: null, backImagePath: null, completedAt: null, error: null},
    audio: {status: 'PENDING', localPath: null, completedAt: null, error: null},
    location: {status: 'PENDING', completedAt: null, error: null},
    liveLocation: {status: 'PENDING', startedAt: null, stoppedAt: null, completedAt: null, error: null},
    backend: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    email: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
    notifications: {status: 'PENDING', completedAt: null, error: null},
    // Canonical emergency-link follow-up SMS. This is a durable queue job
    // (LINK_SMS), never an in-memory Promise — see enqueueSosJob() call in
    // activateSosFlow below and the `linkSms` processor in App.js.
    linkSms: {status: 'PENDING', attempts: 0, lastAttemptAt: null, completedAt: null, error: null},
  };
}

export async function createSosLocalEvent({userId, collectionId, meta = {}}) {
  const event = {
    id: generateClientSosId(),
    userId,
    collectionId,
    createdAt: new Date().toISOString(),
    activatedAt: null,
    status: SOS_STATES.IDLE,
    location: {
      latitude: null,
      longitude: null,
      accuracy: null,
      capturedAt: null,
    },
    services: createBaseServiceState(),
    meta,
  };

  const active = transitionSosState(event, SOS_STATES.ACTIVE);
  if (!active.ok) {
    throw new Error(active.reason);
  }
  const activeEvent = {
    ...active.event,
    activatedAt: event.createdAt,
  };
  await sosLocalStore.upsertSos(activeEvent);
  if (__DEV__) console.log('[SOS_DEBUG] LOCAL_SOS_CREATED', {localSosId: activeEvent.id, status: activeEvent.status});
  return activeEvent;
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
} = {}) {
  if (__DEV__) console.log('[SOS_DEBUG] ACTIVATE_FLOW_START', {
    timestamp: new Date().toISOString(),
    userId,
    collectionId,
  });
  if (cancelSignal?.cancelled) {
    return {event: null, execution: [], cancelled: true};
  }

  const event = await createSosLocalEvent({userId, collectionId});
  emitSosDiagnostic('SOS DEBUG 04: Local SOS created');
  if (__DEV__) console.log('SOS_ACTIVATED', {eventId: event.id, userId, collectionId});
  emitSosToast('SOS started', 'info', 2000);
  
  if (typeof onPending === 'function') {
    await onPending(event);
  }

  if (cancelSignal?.cancelled) {
    const cancellation = transitionSosState(event, SOS_STATES.CANCELLED);
    if (cancellation.ok) {
      await sosLocalStore.upsertSos(cancellation.event);
      return {event: cancellation.event, execution: [], cancelled: true};
    }
  }

  // The canonical-link follow-up SMS is enqueued unconditionally and
  // immediately, regardless of current connectivity or backend timing.
  // It is a persistent queue job (survives app close/restart/process
  // death) rather than an in-memory Promise chain: the `linkSms`
  // processor (frontend/App.js) checks event.emergencyLink on every
  // attempt and simply stays PENDING/RETRY_WAITING until the backend
  // has produced a link AND cellular is available. This call is
  // idempotent — enqueueSosJob keys on {sosId}:{type}, so repeated
  // calls (e.g. from recovery.js after a restart) never create a
  // second job for the same SOS.
  await enqueueSosJob({sosId: event.id, type: 'LINK_SMS', serviceName: 'linkSms'});

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
      console.log(`[SOS][${serviceName === 'mediaUpload' ? 'UPLOAD' : serviceName.toUpperCase()}] START`, {eventId: event.id});
    }

    try {
      const result = await runners[serviceName](event);
      const resultStatus = result?.status || 'COMPLETED';
      if (serviceName === 'backend') emitSosDiagnostic(`SOS DEBUG BACKEND 03: Backend result ${resultStatus}`);
      if (serviceName === 'mediaUpload') emitSosDiagnostic(`SOS DEBUG UPLOAD: Overall ${resultStatus}`);

      if (__DEV__) {
        console.log(`${tagPrefix}_FINISHED`, {eventId: event.id, serviceName, resultStatus, result});
      }
      if (resultStatus === 'PENDING') {
        if (__DEV__) console.log(`[SOS][${serviceName === 'mediaUpload' ? 'UPLOAD' : serviceName.toUpperCase()}] QUEUED`, {eventId: event.id, reason: result?.reason});
        if (result?.reason) reportSosServiceError(serviceName, result, {status: 'QUEUED', eventId: event.id});
      } else if (['FAILED', 'UNSUPPORTED'].includes(resultStatus)) {
        reportSosServiceError(serviceName, result, {eventId: event.id});
      }

      if (serviceName === 'backend') {
        if (result?.backendId) {
          event.backendId = result.backendId;
          event.emergencyLink = result.emergencyLink || null;
          event.activatedAt = result.activatedAt || event.activatedAt || null;
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
          ...(result.frontError !== undefined ? {frontError: result.frontError} : {}),
          ...(result.backError !== undefined ? {backError: result.backError} : {}),
          ...(result.localPath !== undefined ? {localPath: result.localPath} : {}),
          ...(result.error !== undefined ? {error: result.error} : {}),
        } : {}),
      };

      if (serviceName === 'location' && result?.latitude != null && result?.longitude != null) {
        event.location = {...event.location, ...result};
      }
      if (serviceName === 'liveLocation' && resultStatus === 'COMPLETED' && result?.startedAt) {
        event.liveLocationStartedAt = result.startedAt;
        event.liveLocationStatus = 'ACTIVE';
      }

      event.services[serviceName] = next;
      if (serviceName === 'location' && isValidLocation(event.location)) {
        await sosLocalStore.upsertSos({...event, location: {...event.location}, services: {...event.services}});
      } else {
        await sosLocalStore.updateSosServiceState(event.id, serviceName, next);
      }
      
      // Emit toast for critical services. Each condition here is
      // independent (not an if/else-if chain) so, for example, the front
      // camera toast and the back camera toast both fire when both
      // succeed, and a partial camera result (status 'PENDING', see
      // cameraService.js) still surfaces whichever lens DID succeed
      // instead of showing nothing until the retry completes.
      if (resultStatus === 'COMPLETED' && serviceName === 'location') {
        const acc = result?.accuracy;
        emitSosToast(`Location acquired (${acc?.toFixed(1) || 'unknown'}m accuracy)`, 'success', 2000);
      }
      if (serviceName === 'camera' && result?.frontImagePath) {
        emitSosToast('Front camera captured', 'success', 2000);
      }
      if (serviceName === 'camera' && result?.backImagePath) {
        emitSosToast('Back camera captured', 'success', 2000);
      }
      if (resultStatus === 'COMPLETED' && serviceName === 'audio' && result?.localPath) {
        emitSosToast('Audio recorded (5 seconds)', 'success', 2000);
      }
      if (serviceName === 'sms' && resultStatus === 'COMPLETED') {
        const count = result?.sentCount;
        emitSosToast(count ? `Emergency SMS sent to ${count} number${count === 1 ? '' : 's'}` : 'Emergency SMS sent', 'success', 2000);
      }
      if (serviceName === 'call' && resultStatus === 'INITIATED') {
        emitSosToast('Emergency call initiated', 'success', 2000);
      }
      
      if (['PENDING', 'FAILED'].includes(resultStatus) && RETRYABLE_SERVICES.has(serviceName)) {
        await enqueueSosJob({sosId: event.id, type: serviceName.toUpperCase(), serviceName});
      }

      return {serviceName, status: resultStatus, result};
    } catch (error) {
      if (__DEV__) {
        console.log(`${tagPrefix}_FAILED`, {eventId: event.id, serviceName, error: error?.message || error});
      }
      reportSosServiceError(serviceName, error, {eventId: event.id});

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

  const remainingNames = names.filter(name => name !== 'backend');
  const appendSettled = settled => execution.push(...settled.map(result => result.status === 'fulfilled' ? result.value : {
    serviceName: result.reason?.serviceName || 'unknown',
    status: 'FAILED',
    error: result.reason?.message || 'Service failed',
  }));

  // SMS, location, camera, audio and call are independent emergency services:
  // they must start immediately once the SOS is triggered and must never wait
  // for the backend SOS record to be created (backend requires internet; SMS
  // does not). Backend creation and the capture-phase services therefore run
  // concurrently instead of backend-first. Media upload is the only phase that
  // genuinely needs the backend SOS id, so it still runs after both finish.
  const captureNames = remainingNames.filter(name => ['location', 'camera', 'audio', 'sms', 'call'].includes(name));
  const backendPromise = names.includes('backend') ? runService('backend') : null;
  const capturePromise = Promise.allSettled(captureNames.map(serviceName => runService(serviceName)));

  const [backendResult, captureResults] = await Promise.all([backendPromise, capturePromise]);
  if (backendResult) {
    execution.push(backendResult);
  }
  appendSettled(captureResults);

  // Location capture and backend creation run concurrently. Deliver the
  // captured coordinates only after the backend has returned its id; this
  // avoids losing a successful location when the create request won the race.
  if (backendReady && isValidLocation(event.location)) {
    await enqueueSosJob({sosId: event.id, type: 'LOCATION', serviceName: 'location'});
  }

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
    const cancellation = transitionSosState(event, SOS_STATES.CANCELLED);
    if (cancellation.ok) {
      await sosLocalStore.upsertSos(cancellation.event);
      return {event: cancellation.event, execution, cancelled: true, result: {
      call: false,
      sms: false,
      location: false,
      camera: false,
      audio: false,
      upload: false,
      notification: false,
      }};
    }
  }

  const nextStatus = SOS_STATES.ACTIVE;
  if (event.status !== nextStatus) {
    const transition = transitionSosState(event, nextStatus);
    if (!transition.ok) {
      throw new Error(transition.reason);
    }
    Object.assign(event, transition.event);
  }
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
    console.log('SOS_FLOW_COMPLETED', {eventId: event.id, status: event.status, summary});
  }
  await sosLocalStore.upsertSos(event);

  // Capture completes locally. Queue the existing upload worker only after
  // the backend record exists, so device paths never become backend URLs.
  if (
    event.services?.camera?.frontImagePath ||
    event.services?.camera?.backImagePath ||
    event.services?.audio?.localPath ||
    event.services?.camera?.status === 'FAILED' ||
    event.services?.audio?.status === 'FAILED'
  ) {
    for (const component of ['frontImage', 'backImage', 'audio']) {
      await enqueueSosJob({
        sosId: event.id,
        backendSosId: event.backendId,
        type: `MEDIA_UPLOAD:${component}`,
        serviceName: 'mediaUpload',
        payload: {component},
      });
    }
  }

  return {event, execution, result: summary};
}

export default {
  createSosLocalEvent,
  generateClientSosId,
  activateSosFlow,
  resolveSosServiceStatus,
  connectivityService,
  SOS_STATES,
  transitionSosState,
};
