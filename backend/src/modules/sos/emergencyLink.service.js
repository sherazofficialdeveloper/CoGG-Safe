const crypto = require('crypto');
const env = require('../../config/env');
const Sos = require('./sos.model');
const Collection = require('../collections/collection.model');
const User = require('../users/user.model');
const ApiError = require('../../utils/ApiError');
const { SOS_STATUS, COMPONENT_STATUS, LIVE_LOCATION_STATUS } = require('../../constants/sosConstants');
const storageProvider = require('../../services/storage/storage.provider');

/**
 * Generates a secure, unguessable public token — 32 bytes of randomness,
 * base64url-encoded (URL-safe, no padding). This is what the public
 * emergency link uses to identify an SOS; it is NEVER the Mongo _id.
 */
function generateEmergencyToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function buildEmergencyLink(token) {
  return `${env.emergencyLink.baseUrl.replace(/\/$/, '')}/${token}`;
}

function safeMediaComponent(component, token, componentName) {
  return {
    status: component.status,
    error: component.status === COMPONENT_STATUS.FAILED ? component.error : null,
    // Relative API path, gated by the SAME emergency token as the rest
    // of this view — never storageProvider.resolveUrl() directly, which
    // would expose a static, permanently-public file URL with no
    // relationship to the SOS's own active/deactivated state.
    url: component.status === COMPONENT_STATUS.SUCCESS ? `/api/emergency/${token}/media/${componentName}` : null,
  };
}

/**
 * Resolves (and authorizes) a media file for the public emergency view.
 * Applies the exact same "only while ACTIVE" rule as
 * getPublicEmergencyView — a deactivated SOS's media stops being
 * servable the instant the SOS is deactivated, with no separate
 * expiry/cache to go stale.
 */
async function getPublicMediaStream(token, componentName) {
  const sos = await Sos.findOne({ emergencyToken: token });
  if (!sos || sos.status !== SOS_STATUS.ACTIVE) {
    throw ApiError.notFound('Emergency information is not available');
  }

  const component = sos.components[componentName];
  if (!component || component.status !== COMPONENT_STATUS.SUCCESS || !component.storageRef) {
    throw ApiError.notFound('Media is not available for this component');
  }

  return {
    stream: await storageProvider.readStream(component.storageRef),
    mimeType: component.mimeType || 'application/octet-stream',
  };
}

/**
 * Resolves the public payload for a given emergency token.
 *
 * SECURITY: an SOS is only ever exposed here while status === ACTIVE.
 *   - Unknown token, PENDING (still cancellable, not a confirmed
 *     emergency yet), CANCELLED, and DEACTIVATED all return the exact
 *     same "not available" 404 — deliberately indistinguishable, so a
 *     stale/deactivated/never-existed token leaks no information about
 *     which case it is.
 * The response is hand-built from a safe allowlist of fields — it never
 * serializes the SOS document directly, so raw Mongo IDs, the
 * emergencyToken itself, and any internal-only fields can never leak
 * through, including if this function is extended later.
 */
async function getPublicEmergencyView(token) {
  const sos = await Sos.findOne({ emergencyToken: token });

  if (!sos || sos.status !== SOS_STATUS.ACTIVE) {
    throw ApiError.notFound('Emergency information is not available');
  }

  if (
    sos.liveLocation?.status === LIVE_LOCATION_STATUS.ACTIVE &&
    sos.liveLocation?.expiresAt &&
    sos.liveLocation.expiresAt.getTime() <= Date.now()
  ) {
    sos.liveLocation.status = LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION;
    sos.liveLocation.stoppedAt = new Date();
    await Sos.updateOne(
      { _id: sos._id, 'liveLocation.status': LIVE_LOCATION_STATUS.ACTIVE },
      { $set: { 'liveLocation.status': LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION, 'liveLocation.stoppedAt': sos.liveLocation.stoppedAt } }
    );
  }

  const [user, collection] = await Promise.all([
    User.findById(sos.userId),
    Collection.findById(sos.collectionId),
  ]);

  return {
    sosReference: token,
    status: sos.status,
    userName: user ? user.username : 'Unknown',
    // Shown to the emergency recipient so they know who to call back —
    // this link is only ever shared with the collection's own trusted
    // contacts/admins, the same audience the SMS/email already reach.
    // Never any other user field (email, role, etc.) — allowlisted here,
    // not passed through from the user document.
    userPhone: user ? user.mobileNumber : null,
    collectionName: collection ? collection.name : 'Unknown',
    emergencyMessage: sos.emergencyMessage,
    createdAt: sos.createdAt,
    location:
      sos.location.status === COMPONENT_STATUS.SUCCESS
        ? { latitude: sos.location.latitude, longitude: sos.location.longitude, capturedAt: sos.location.capturedAt }
        : { status: sos.location.status, error: sos.location.error || null },
    liveLocation: {
      status: sos.liveLocation.status,
      startedAt: sos.liveLocation.startedAt,
      expiresAt: sos.liveLocation.expiresAt,
      lastLocation: sos.liveLocation.lastLocation && sos.liveLocation.lastLocation.capturedAt
        ? sos.liveLocation.lastLocation
        : null,
    },
    media: {
      frontImage: safeMediaComponent(sos.components.frontImage, token, 'frontImage'),
      backImage: safeMediaComponent(sos.components.backImage, token, 'backImage'),
      audio: safeMediaComponent(sos.components.audio, token, 'audio'),
    },
  };
}

module.exports = { generateEmergencyToken, buildEmergencyLink, getPublicEmergencyView, getPublicMediaStream };
