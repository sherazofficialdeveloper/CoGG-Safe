/**
 * Overall SOS lifecycle status.
 * This is distinct from individual component status (see COMPONENT_STATUS) —
 * a single failed component must never force the whole SOS into "failed".
 */
const SOS_STATUS = Object.freeze({
  PENDING: 'pending', // created, inside the cancellation window
  ACTIVE: 'active', // processing / ongoing emergency
  CANCELLED: 'cancelled', // cancelled by user during cancellation window
  DEACTIVATED: 'deactivated', // deactivated by admin, history preserved
});

/**
 * Status for each individually-tracked SOS component
 * (front image, back image, audio, sms, email, push, call, location).
 */
const COMPONENT_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  FAILED: 'failed',
  UNKNOWN: 'unknown', // provider accepted/attempted delivery but outcome was not confirmable
  UNSUPPORTED: 'unsupported',
  SKIPPED: 'skipped', // e.g. email skipped because none configured
});

const COLLECTION_TYPES = Object.freeze({
  FAMILY: 'family',
  WORKERS: 'workers',
  OTHER: 'other',
});

const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

const LIVE_LOCATION_STATUS = Object.freeze({
  ACTIVE: 'active',
  STOPPED_BY_USER: 'stopped_by_user',
  STOPPED_BY_ADMIN: 'stopped_by_admin',
  STOPPED_MAX_DURATION: 'stopped_max_duration',
  STOPPED_SOS_DEACTIVATED: 'stopped_sos_deactivated',
});

/**
 * The fixed set of individually-tracked SOS components (Phase 4).
 * Each carries its own COMPONENT_STATUS + optional error, independent
 * of the others and independent of the overall SOS_STATUS.
 */
const COMPONENT_NAMES = Object.freeze({
  FRONT_IMAGE: 'frontImage',
  BACK_IMAGE: 'backImage',
  AUDIO: 'audio',
  SMS: 'sms',
  EMAIL: 'email',
  PUSH: 'push',
  CALL: 'call',
  BACKEND: 'backend',
});

const MEDIA_COMPONENT_NAMES = Object.freeze([
  COMPONENT_NAMES.FRONT_IMAGE,
  COMPONENT_NAMES.BACK_IMAGE,
  COMPONENT_NAMES.AUDIO,
]);

module.exports = {
  SOS_STATUS,
  COMPONENT_STATUS,
  COLLECTION_TYPES,
  USER_STATUS,
  LIVE_LOCATION_STATUS,
  COMPONENT_NAMES,
  MEDIA_COMPONENT_NAMES,
};
