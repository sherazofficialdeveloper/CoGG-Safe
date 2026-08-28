const PushToken = require('./pushToken.model');
const ApiError = require('../../utils/ApiError');

/**
 * Registers or refreshes a device token for the authenticated user.
 * Upserts BY TOKEN (not by userId+token): a token belongs to exactly one
 * device, so if the same token is registered again — whether by the
 * same user refreshing it, or a different user who has now logged into
 * that same device — ownership simply moves to whoever registers it
 * last. This is what makes "logout, then a different user logs in on
 * the same phone" behave correctly without a separate migration step.
 */
async function registerToken(userId, { token, platform }) {
  return PushToken.findOneAndUpdate(
    { token },
    { $set: { userId, platform, lastSeenAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * Removes one specific device's token — the standard mobile "logout"
 * flow: the app unregisters its own token so this device stops
 * receiving pushes for the user who just logged out. Ownership-checked
 * so a user can only remove their own device's registration.
 */
async function removeToken(userId, token) {
  const existing = await PushToken.findOne({ token });
  if (!existing) {
    return; // already gone — removing a token twice is a harmless no-op
  }
  if (String(existing.userId) !== String(userId)) {
    throw ApiError.forbidden('You do not have permission to remove this device token');
  }
  await PushToken.deleteOne({ _id: existing._id });
}

/** All currently-registered device tokens for a user — used by dispatch to fan out to every device. */
async function getTokensForUser(userId) {
  return PushToken.find({ userId });
}

/**
 * Cleanup hook: called when a real push provider reports a token as no
 * longer valid (uninstalled app, expired registration, etc.) — see
 * push.provider.js's INVALID_TOKEN error convention and
 * dispatch.service's use of it. Removing by token value, not by id,
 * since the caller only has the raw token at that point.
 */
async function removeTokenByValue(token) {
  await PushToken.deleteOne({ token });
}

module.exports = { registerToken, removeToken, getTokensForUser, removeTokenByValue };
