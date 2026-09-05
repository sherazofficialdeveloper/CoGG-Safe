const Sos = require('./sos.model');
const LiveLocationUpdate = require('./liveLocationUpdate.model');
const Notification = require('../notifications/notification.model');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const { isAdmin, assertOwnerOrAdmin } = require('../../utils/authz');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const { SOS_STATUS, COMPONENT_STATUS, LIVE_LOCATION_STATUS } = require('../../constants/sosConstants');
const { generateEmergencyToken } = require('./emergencyLink.service');
const { setComponentStatus } = require('./component.util');
const storageProvider = require('../../services/storage/storage.provider');
const dispatchService = require('./dispatch.service');
const schedulerService = require('../scheduler/scheduler.service');

// ---------------------------------------------------------------------
// The remaining time-based transition:
//   liveLocation ACTIVE -> STOPPED_MAX_DURATION, after 3 hours.
// Driven by the durable scheduler (src/modules/scheduler) — jobs are
// persisted in MongoDB, so they survive a server restart. This module
// only ever talks to the scheduler through its generic interface
// (registerHandler/scheduleJob/cancelJobsForSos); it has no idea how or
// when jobs are actually run, which is what keeps the SOS state machine
// independent from the scheduler implementation and lets it be swapped
// for a different job system later without touching anything below.
//
// Live-location expiry is ALSO lazily re-checked on read/write
// (enforceLiveLocationExpiry). Legacy pending SOS records retain an atomic
// activation handler for safe compatibility after this lifecycle change.
// ---------------------------------------------------------------------
const JOB_TYPE_SOS_ACTIVATION = 'sos_activation';
const JOB_TYPE_LIVE_LOCATION_EXPIRY = 'live_location_expiry';

const DEFAULT_EMERGENCY_MESSAGE_TEMPLATE = 'I am [Username]. I may be in danger. Please help me.';

function resolveEmergencyMessage(user) {
  if (user.emergencyMessage) return user.emergencyMessage;
  return DEFAULT_EMERGENCY_MESSAGE_TEMPLATE.replace('[Username]', user.username);
}

/**
 * Legacy SOS_ACTIVATION handler for records created before the direct-ACTIVE
 * lifecycle. New SOS creation never schedules this job.
 */
async function activateSosIfPending({ sosId, dispatch = true }) {
  console.log('[SOS_DEBUG] ACTIVATION_STARTED', { sosId: String(sosId) });
  const activated = await Sos.findOneAndUpdate(
    { _id: sosId, status: SOS_STATUS.PENDING },
    { $set: { status: SOS_STATUS.ACTIVE, activatedAt: new Date() } },
    { new: true }
  );
  console.log('[SOS_DEBUG] ACTIVATION_RESULT', {
    sosId: String(sosId),
    status: activated ? activated.status : 'not_updated',
  });
  if (activated && dispatch) {
    await dispatchService.dispatchSos(activated);
  }
  return activated;
}

schedulerService.registerHandler(JOB_TYPE_SOS_ACTIVATION, activateSosIfPending);

/**
 * The LIVE_LOCATION_EXPIRY job handler. Delegates to the same atomic
 * conditional stop used by manual stop and the deactivation cascade, so
 * a late/duplicate run (e.g. after a manual stop already happened) is a
 * harmless no-op.
 */
async function expireLiveLocationIfActive({ sosId }) {
  await stopLiveLocationInternal(sosId, LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION);
}

schedulerService.registerHandler(JOB_TYPE_LIVE_LOCATION_EXPIRY, expireLiveLocationIfActive);

/**
 * Atomic conditional stop, reused by manual stop (user/admin), automatic
 * 3-hour expiry, and the deactivation cascade. Only transitions if
 * liveLocation.status is currently ACTIVE, so a second/late caller
 * (e.g. the expiry job running after a manual stop already happened) is
 * a harmless no-op.
 */
async function stopLiveLocationInternal(sosId, targetStatus) {
  await Sos.updateOne(
    { _id: sosId, 'liveLocation.status': LIVE_LOCATION_STATUS.ACTIVE },
    { $set: { 'liveLocation.status': targetStatus, 'liveLocation.stoppedAt': new Date() } }
  );
  await schedulerService.cancelJobsForSos(JOB_TYPE_LIVE_LOCATION_EXPIRY, sosId);
}

/**
 * Defense-in-depth: even if the scheduler hasn't run the expiry job yet
 * (poll interval lag, or a restart that delayed it), any read/write
 * touching this SOS re-checks the 3-hour cutoff and stops it if overdue,
 * before doing anything else.
 */
async function enforceLiveLocationExpiry(sos) {
  if (
    sos.liveLocation.status === LIVE_LOCATION_STATUS.ACTIVE &&
    sos.liveLocation.expiresAt &&
    sos.liveLocation.expiresAt.getTime() <= Date.now()
  ) {
    await stopLiveLocationInternal(sos._id, LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION);
    sos.liveLocation.status = LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION;
    sos.liveLocation.stoppedAt = new Date();
  }
  return sos;
}

async function activateSosIfDue(sos) {
  if (!sos || sos.status !== SOS_STATUS.PENDING) {
    return sos;
  }

  const activated = await Sos.findOneAndUpdate(
    { _id: sos._id, status: SOS_STATUS.PENDING },
    { $set: { status: SOS_STATUS.ACTIVE, activatedAt: new Date() } },
    { new: true }
  );

  if (!activated) {
    return sos;
  }

  await dispatchService.dispatchSos(activated);
  return activated;
}

async function getSosOrThrow(id) {
  const sos = await Sos.findById(id);
  if (!sos) {
    throw ApiError.notFound('SOS not found');
  }
  return activateSosIfDue(sos);
}

/** Owner or admin — read access. */
async function getSosById(id, reqUser) {
  const sos = await getSosOrThrow(id);
  assertOwnerOrAdmin(sos.userId, reqUser, 'You do not have permission to access this SOS');
  await enforceLiveLocationExpiry(sos);
  await sos.populate([
    { path: 'userId', select: 'username mobileNumber email' },
    { path: 'collectionId', select: 'name type' },
  ]);
  return sos;
}

/** Owner ONLY — used for actions a user performs on their own emergency (report location/media, cancel, start/ping live location). Admins deliberately cannot trigger these on someone else's behalf. */
async function getOwnedSosOrThrow(id, reqUser, message) {
  const sos = await getSosOrThrow(id);
  if (String(sos.userId) !== String(reqUser.id)) {
    throw ApiError.forbidden(message || 'You do not have permission to modify this SOS');
  }
  return sos;
}

/**
 * Creates an SOS for the authenticated user.
 *
 * SECURITY: userId/collectionId are NEVER read from the request body —
 * the user is loaded fresh from the database by their authenticated id,
 * and their collection comes from that database record. There is no
 * parameter through which a caller could create an SOS "as" someone else
 * or attach it to a collection other than their own.
 *
 * IDEMPOTENCY: if `idempotencyKey` is supplied (offline-sync retries)
 * and an SOS with that (userId, idempotencyKey) pair already exists,
 * that existing record is returned instead of creating a duplicate —
 * including when two near-simultaneous retries race each other (the
 * unique index on (userId, idempotencyKey) is the final backstop; a
 * resulting duplicate-key error is treated as "the other retry won",
 * not as a real conflict).
 */
async function createSos({ userId, idempotencyKey, location }) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.unauthorized('User no longer exists');
  }
  if (!user.collectionId) {
    throw ApiError.badRequest('You are not assigned to a collection and cannot trigger an SOS');
  }

  if (idempotencyKey) {
    const existing = await Sos.findOne({ userId, idempotencyKey });
    if (existing) return { sos: existing, alreadyExisted: true };
  }

  const openSos = await Sos.findOne({
    userId: user._id,
    status: { $in: [SOS_STATUS.PENDING, SOS_STATUS.ACTIVE] },
  }).sort({ createdAt: -1 });
  console.log('[SOS_DEBUG] OPEN_SOS_CHECK', {
    userId: String(user._id),
    exists: Boolean(openSos),
    sosId: openSos ? String(openSos._id) : null,
    status: openSos?.status || null,
    idempotencyKey: idempotencyKey || null,
  });

  if (openSos) {
    throw ApiError.conflict('An SOS is already pending or active for this user');
  }

  let sos;
  try {
    sos = await Sos.create({
      userId: user._id,
      collectionId: user.collectionId,
      emergencyMessage: resolveEmergencyMessage(user),
      emergencyToken: generateEmergencyToken(),
      idempotencyKey: idempotencyKey || undefined,
      status: SOS_STATUS.ACTIVE,
      activatedAt: new Date(),
    });
    console.log('[SOS_DEBUG] MONGO_CREATED', { sosId: String(sos._id) });
  } catch (err) {
    if (err.code === 11000 && idempotencyKey) {
      const existing = await Sos.findOne({ userId, idempotencyKey });
      if (existing) return { sos: existing, alreadyExisted: true };
    }
    throw err;
  }

  if (location && location.latitude !== undefined && location.longitude !== undefined) {
    sos.location = {
      latitude: location.latitude,
      longitude: location.longitude,
      ...(location.accuracy !== undefined ? {accuracy: location.accuracy} : {}),
      capturedAt: location.capturedAt && !isNaN(new Date(location.capturedAt).getTime())
        ? new Date(location.capturedAt) : new Date(),
      ...(location.source ? {source: String(location.source).trim().toLowerCase()} : {}),
      ...(location.providerTimestamp && !isNaN(new Date(location.providerTimestamp).getTime())
        ? {providerTimestamp: new Date(location.providerTimestamp)} : {}),
      status: COMPONENT_STATUS.SUCCESS,
      error: null,
    };
    await sos.save();
  }

  // The emergency record is durable at this point. Dispatch is deliberately
  // started after the response path so a slow provider cannot delay SOS
  // creation; dispatchSos isolates and records each channel failure.
  void dispatchService.dispatchSos(sos).catch((err) => {
    console.error('[SOS_DEBUG] DISPATCH_UNHANDLED', {
      sosId: String(sos._id),
      error: err?.message || 'SOS dispatch failed unexpectedly',
    });
  });

  return { sos, alreadyExisted: false };
}

/**
 * The owner explicitly starts server dispatch only after the client has
 * persisted available location/media/local telephony results. The conditional
 * activation makes this one-shot: retries after success cannot resend email
 * or push notifications.
 */
async function dispatchSosAfterPersistence(id, reqUser) {
  await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to dispatch this SOS');
  const activated = await activateSosIfPending({ sosId: id });
  if (!activated) {
    throw ApiError.conflict('SOS dispatch has already started or is no longer pending');
  }
  return getSosById(id, reqUser);
}

async function listSos(query, reqUser) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  if (isAdmin(reqUser)) {
    if (query.status) filter.status = query.status;
    if (query.collectionId) filter.collectionId = query.collectionId;
    if (query.userId) filter.userId = query.userId;
  } else {
    // Non-admins can only ever see their own SOS records — any
    // userId/collectionId in the query is ignored, never trusted.
    filter.userId = reqUser.id;
    if (query.status) filter.status = query.status;
  }

  const [items, total] = await Promise.all([
    Sos.find(filter)
      .populate('userId', 'username mobileNumber email')
      .populate('collectionId', 'name type')
      .sort({ createdAt: -1 }).skip(skip).limit(limit),
    Sos.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

/**
 * User-only cancellation, valid only while PENDING. Uses the same
 * atomic-conditional-update pattern as activation so a cancel racing
 * against activation is resolved safely: whichever update runs first
 * (in the database, not in wall-clock arrival order) wins.
 */
async function cancelSos(id, reqUser) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to cancel this SOS');

  if (sos.status !== SOS_STATUS.PENDING) {
    throw ApiError.conflict('This SOS can no longer be cancelled');
  }

  const updated = await Sos.findOneAndUpdate(
    { _id: id, status: SOS_STATUS.PENDING },
    { $set: { status: SOS_STATUS.CANCELLED, cancelledAt: new Date(), cancelledBy: reqUser.id } },
    { new: true }
  );

  if (!updated) {
    // Lost the race against activation.
    throw ApiError.conflict('This SOS can no longer be cancelled');
  }

  await schedulerService.cancelJobsForSos(JOB_TYPE_SOS_ACTIVATION, id);

  return updated;
}

/**
 * Admin-only deactivation (enforced by route-level authorize(ROLES.ADMIN)),
 * valid only while ACTIVE. Also stops live location sharing if it was
 * running — deactivating the SOS and "stop sharing" are different
 * operations, but an emergency that's been deactivated can't keep
 * broadcasting live location either.
 */
async function deactivateSos(id, reqUser) {
  const sos = await getSosOrThrow(id);

  if (sos.status !== SOS_STATUS.ACTIVE) {
    throw ApiError.conflict('Only an active SOS can be deactivated');
  }

  const updated = await Sos.findOneAndUpdate(
    { _id: id, status: SOS_STATUS.ACTIVE },
    { $set: { status: SOS_STATUS.DEACTIVATED, deactivatedAt: new Date(), deactivatedBy: reqUser.id } },
    { new: true }
  );

  if (!updated) {
    throw ApiError.conflict('This SOS can no longer be deactivated');
  }

  if (updated.liveLocation.status === LIVE_LOCATION_STATUS.ACTIVE) {
    await stopLiveLocationInternal(id, LIVE_LOCATION_STATUS.STOPPED_SOS_DEACTIVATED);
    updated.liveLocation.status = LIVE_LOCATION_STATUS.STOPPED_SOS_DEACTIVATED;
  }

  return updated;
}

async function deleteSos(id, reqUser) {
  if (!isAdmin(reqUser)) {
    throw ApiError.forbidden('Only an admin can delete an SOS');
  }
  const sos = await getSosOrThrow(id);
  await Promise.all([
    Sos.deleteOne({_id: sos._id}),
    LiveLocationUpdate.deleteMany({sosId: sos._id}),
    Notification.deleteMany({sosId: sos._id}),
    schedulerService.cancelJobsForSos(JOB_TYPE_LIVE_LOCATION_EXPIRY, id),
  ]);
  return sos;
}

/** Owner reports (or corrects) their SOS's initial location capture. */
async function reportLocation(id, reqUser, payload) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to update this SOS location');

  if (![SOS_STATUS.PENDING, SOS_STATUS.ACTIVE].includes(sos.status)) {
    throw ApiError.conflict('Location can only be reported while the SOS is pending or active');
  }

  const isFailure = payload.status === COMPONENT_STATUS.FAILED;
  const update = isFailure
    ? {
        'location.status': COMPONENT_STATUS.FAILED,
        'location.error': payload.error,
        'location.capturedAt': new Date(),
      }
    : {
        'location.status': COMPONENT_STATUS.SUCCESS,
        'location.error': null,
        'location.latitude': payload.latitude,
        'location.longitude': payload.longitude,
        'location.accuracy': payload.accuracy ?? null,
        'location.capturedAt': payload.capturedAt && !isNaN(new Date(payload.capturedAt).getTime())
          ? new Date(payload.capturedAt) : new Date(),
        'location.source': payload.source ? String(payload.source).trim().toLowerCase() : null,
        'location.providerTimestamp': payload.providerTimestamp && !isNaN(new Date(payload.providerTimestamp).getTime())
          ? new Date(payload.providerTimestamp) : null,
      };

  await Sos.updateOne({ _id: id }, { $set: update });
  return getSosById(id, reqUser);
}

/** Owner reports a media component's result (never the binary itself). */
async function reportMedia(id, reqUser, componentName, payload) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to update this SOS media');

  if (![SOS_STATUS.PENDING, SOS_STATUS.ACTIVE].includes(sos.status)) {
    throw ApiError.conflict('Media can only be reported while the SOS is pending or active');
  }

  const status = [COMPONENT_STATUS.FAILED, COMPONENT_STATUS.UNSUPPORTED, COMPONENT_STATUS.SKIPPED].includes(payload.status)
    ? payload.status
    : COMPONENT_STATUS.SUCCESS;
  await setComponentStatus(id, componentName, status, {
    error: status === COMPONENT_STATUS.FAILED ? payload.error : null,
    storageRef: status === COMPONENT_STATUS.SUCCESS ? payload.storageRef : null,
    mimeType: status === COMPONENT_STATUS.SUCCESS ? payload.mimeType || null : null,
  });

  return getSosById(id, reqUser);
}

async function reportServiceResult(id, reqUser, componentName, payload) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to update this SOS service');
  if (![SOS_STATUS.PENDING, SOS_STATUS.ACTIVE].includes(sos.status)) {
    throw ApiError.conflict('Service results can only be reported while the SOS is pending or active');
  }
  const status = payload.status;
  await setComponentStatus(id, componentName, status, {
    error: [COMPONENT_STATUS.FAILED, COMPONENT_STATUS.UNSUPPORTED, COMPONENT_STATUS.SKIPPED].includes(status)
      ? payload.error || null
      : null,
  });
  return getSosById(id, reqUser);
}

/**
 * Owner uploads an actual media file (front/back image, 5-second audio).
 * Stores the bytes via the storage provider abstraction, then records
 * the result through the exact same reportMedia() path a client-side
 * "report only" call would use — so success/failure recording behaves
 * identically either way, and this function adds no new component-status
 * logic of its own.
 *
 * A storage failure is recorded as a FAILED component, never as an SOS
 * failure and never by pretending the upload succeeded — consistent
 * with every other component in this module.
 */
async function uploadMedia(id, reqUser, componentName, file) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to upload media for this SOS');
  if (![SOS_STATUS.PENDING, SOS_STATUS.ACTIVE].includes(sos.status)) {
    throw ApiError.conflict('Media can only be uploaded while the SOS is pending or active');
  }

  try {
    const storageRef = await storageProvider.store({
      buffer: file.buffer,
      folder: `sos/${id}`,
      originalFilename: file.originalname,
    });
    return reportMedia(id, reqUser, componentName, {
      status: COMPONENT_STATUS.SUCCESS,
      storageRef,
      mimeType: file.mimetype,
    });
  } catch (err) {
    return reportMedia(id, reqUser, componentName, {
      status: COMPONENT_STATUS.FAILED,
      error: err.message || 'Media upload failed',
    });
  }
}
async function startLiveLocation(id, reqUser) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to start live location for this SOS');

  if (sos.status !== SOS_STATUS.ACTIVE) {
    throw ApiError.conflict('Live location can only be started for an active SOS');
  }
  if (sos.liveLocation.status === LIVE_LOCATION_STATUS.ACTIVE) {
    throw ApiError.conflict('Live location is already active for this SOS');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.sos.liveLocationMaxDurationHours * 60 * 60 * 1000);

  const updated = await Sos.findOneAndUpdate(
    { _id: id, status: SOS_STATUS.ACTIVE, 'liveLocation.status': { $ne: LIVE_LOCATION_STATUS.ACTIVE } },
    {
      $set: {
        'liveLocation.status': LIVE_LOCATION_STATUS.ACTIVE,
        'liveLocation.startedAt': now,
        'liveLocation.stoppedAt': null,
        'liveLocation.expiresAt': expiresAt,
      },
    },
    { new: true }
  );

  if (!updated) {
    throw ApiError.conflict('Live location could not be started');
  }

  await schedulerService.scheduleJob(JOB_TYPE_LIVE_LOCATION_EXPIRY, { sosId: String(id) }, expiresAt);
  return updated;
}

/** Owner only. */
async function pingLiveLocation(id, reqUser, { latitude, longitude, accuracy, capturedAt, source }) {
  const sos = await getOwnedSosOrThrow(id, reqUser, 'You do not have permission to update this SOS live location');
  await enforceLiveLocationExpiry(sos);

  if (sos.status !== SOS_STATUS.ACTIVE || sos.liveLocation.status !== LIVE_LOCATION_STATUS.ACTIVE) {
    throw ApiError.conflict('Live location is not currently active for this SOS');
  }

  const pingTime = (capturedAt && !isNaN(new Date(capturedAt).getTime())) ? new Date(capturedAt) : new Date();
  await LiveLocationUpdate.create({
    sosId: sos._id, latitude, longitude, accuracy: accuracy ?? null, capturedAt: pingTime,
    source: source ? String(source).trim().toLowerCase() : null,
  });

  const currentCapturedAt = sos.liveLocation?.lastLocation?.capturedAt
    ? new Date(sos.liveLocation.lastLocation.capturedAt).getTime()
    : 0;

  if (pingTime.getTime() >= currentCapturedAt) {
    await Sos.updateOne(
      { _id: id },
      { $set: { 'liveLocation.lastLocation': {
        latitude, longitude, accuracy: accuracy ?? null, capturedAt: pingTime,
        source: source ? String(source).trim().toLowerCase() : null,
      } } }
    );
  }

  return { latitude, longitude, accuracy: accuracy ?? null, capturedAt: pingTime, source: source || null };
}

/**
 * Owner OR admin. Distinguishes who stopped it: if the actor IS the
 * SOS's own owner, it's recorded as user-stopped even if that user also
 * happens to hold the admin role; otherwise it's admin-stopped.
 */
async function stopLiveLocation(id, reqUser) {
  const sos = await getSosOrThrow(id);
  assertOwnerOrAdmin(sos.userId, reqUser, 'You do not have permission to stop this SOS live location');

  if (sos.liveLocation.status !== LIVE_LOCATION_STATUS.ACTIVE) {
    throw ApiError.conflict('Live location is not currently active for this SOS');
  }

  const stoppedByOwner = String(sos.userId) === String(reqUser.id);
  const targetStatus = stoppedByOwner ? LIVE_LOCATION_STATUS.STOPPED_BY_USER : LIVE_LOCATION_STATUS.STOPPED_BY_ADMIN;

  await stopLiveLocationInternal(id, targetStatus);
  return getSosById(id, reqUser);
}

/**
 * Owner or admin — streams a stored media file back, after checking the
 * exact same authorization used for the rest of the SOS (see
 * assertOwnerOrAdmin) and that the component actually succeeded. This
 * is what makes media access "securely associated with the correct
 * SOS" per spec: there is no way to reach a file without first passing
 * this SOS's own authorization check.
 */
async function getMediaFileStream(id, reqUser, componentName) {
  const sos = await getSosById(id, reqUser); // owner-or-admin
  const component = sos.components[componentName];

  if (!component || component.status !== COMPONENT_STATUS.SUCCESS || !component.storageRef) {
    throw ApiError.notFound('Media is not available for this component');
  }

  return {
    stream: await storageProvider.readStream(component.storageRef),
    mimeType: component.mimeType || 'application/octet-stream',
  };
}

async function getLiveLocation(id, reqUser, query = {}) {
  const sos = await getSosById(id, reqUser); // owner-or-admin + expiry enforcement
  const { page, limit, skip } = parsePagination(query);

  const [pings, total] = await Promise.all([
    LiveLocationUpdate.find({ sosId: id }).sort({ capturedAt: -1 }).skip(skip).limit(limit),
    LiveLocationUpdate.countDocuments({ sosId: id }),
  ]);

  return {
    liveLocation: sos.liveLocation,
    pings,
    meta: buildPaginationMeta({ page, limit, total }),
  };
}

module.exports = {
  resolveEmergencyMessage,
  createSos,
  listSos,
  getSosById,
  dispatchSosAfterPersistence,
  cancelSos,
  deactivateSos,
  deleteSos,
  reportLocation,
  reportMedia,
  reportServiceResult,
  uploadMedia,
  startLiveLocation,
  pingLiveLocation,
  stopLiveLocation,
  getLiveLocation,
  getMediaFileStream,
};
