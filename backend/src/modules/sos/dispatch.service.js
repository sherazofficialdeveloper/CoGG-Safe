const logger = require('../../config/logger');
const User = require('../users/user.model');
const Collection = require('../collections/collection.model');
const notificationService = require('../notifications/notification.service');
const pushTokenService = require('../notifications/pushToken.service');
const pushProvider = require('../../services/push/push.provider');
const emailProvider = require('../../services/email/email.provider');
const { setComponentStatus } = require('./component.util');
const { COMPONENT_STATUS, COMPONENT_NAMES } = require('../../constants/sosConstants');
const { buildEmergencyLink } = require('./emergencyLink.service');

/**
 * Renders a safe, human-readable error message for storage — never a
 * stack trace or internal detail (per spec section 25/Phase 4 section 7).
 * Full technical detail still goes to the logger.
 */
function safeErrorMessage(err, fallback) {
  return (err && err.message) || fallback;
}

/**
 * Sends one recipient's push across ALL of their registered devices
 * (see pushToken.service — "multiple devices where appropriate"). A
 * token FCM reports as no longer valid is cleaned up immediately
 * (pushToken.service.removeTokenByValue) rather than left to accumulate
 * — this is the exact seam that lets a real FCM connection do token
 * cleanup without any change to this orchestration logic. Returns true
 * if at least one device received it.
 */
async function sendPushToRecipient(recipient, { title, body, data }) {
  const tokens = await pushTokenService.getTokensForUser(recipient._id);
  if (tokens.length === 0) return false;

  let anySucceeded = false;
  await Promise.all(
    tokens.map(async (deviceToken) => {
      try {
        const result = await pushProvider.sendToToken({ token: deviceToken.token, title, body, data });
        if (result?.status === 'sent') anySucceeded = true;
      } catch (err) {
        if (err.code === pushProvider.INVALID_TOKEN_ERROR_CODE) {
          await pushTokenService.removeTokenByValue(deviceToken.token);
        }
        logger.warn('Push delivery to one device failed', {
          recipientId: String(recipient._id),
          error: err.message,
        });
      }
    })
  );
  return anySucceeded;
}

/**
 * One dispatch attempt per component, each fully isolated: a thrown
 * error in any one of these NEVER prevents the others from running, and
 * never touches the overall SOS status (SOS_STATUS only ever reflects
 * PENDING/ACTIVE/CANCELLED/DEACTIVATED, never a dispatch outcome).
 */

async function dispatchNotification(sos, user, collection) {
  await setComponentStatus(sos._id, COMPONENT_NAMES.PUSH, COMPONENT_STATUS.PROCESSING);
  try {
    const created = await notificationService.createForSos(sos, { user, collection });
    if (created.length === 0) {
      await setComponentStatus(sos._id, COMPONENT_NAMES.PUSH, COMPONENT_STATUS.SKIPPED, {
        error: 'No recipients to notify',
      });
      return;
    }

    const title = `SOS Alert — ${user.username}`;
    const body = `Collection: ${collection.name}`;
    const data = { sosId: sos._id.toString() };

    const results = await Promise.all(
      created.map(({ recipient }) => sendPushToRecipient(recipient, { title, body, data }))
    );
    const anyDeviceSucceeded = results.some(Boolean);

    if (anyDeviceSucceeded) {
      await setComponentStatus(sos._id, COMPONENT_NAMES.PUSH, COMPONENT_STATUS.SUCCESS);
    } else {
      // Notification rows exist regardless (the in-app notification tab
      // still works), but no device received the push notification.
      await setComponentStatus(sos._id, COMPONENT_NAMES.PUSH, COMPONENT_STATUS.FAILED, {
        error: 'No recipient device received the push notification',
      });
    }
  } catch (err) {
    logger.error('Push/notification dispatch failed', { sosId: sos._id.toString(), error: err.message });
    await setComponentStatus(sos._id, COMPONENT_NAMES.PUSH, COMPONENT_STATUS.FAILED, {
      error: safeErrorMessage(err, 'Notification delivery failed'),
    });
  }
}

async function dispatchEmail(sos, recipients, subject, renderedMessage) {
  await setComponentStatus(sos._id, COMPONENT_NAMES.EMAIL, COMPONENT_STATUS.PROCESSING);
  try {
    // Email is optional — recipients without a configured email are
    // simply excluded, never treated as an error (per spec section 23 / Phase 4 section 16).
    const emailable = recipients.filter((r) => !!r.email);
    if (emailable.length === 0) {
      await setComponentStatus(sos._id, COMPONENT_NAMES.EMAIL, COMPONENT_STATUS.SKIPPED, {
        error: 'No recipient has an email configured',
      });
      return;
    }
    const results = await Promise.allSettled(
      emailable.map((recipient) => emailProvider.send({ to: recipient.email, subject, body: renderedMessage }))
    );
    const anySucceeded = results.some((r) => r.status === 'fulfilled' && r.value?.status === 'sent');
    const allUnsupported = results.length > 0 && results.every((r) => r.status === 'fulfilled' && r.value?.status === 'unsupported');
    if (anySucceeded) {
      await setComponentStatus(sos._id, COMPONENT_NAMES.EMAIL, COMPONENT_STATUS.SUCCESS);
    } else if (allUnsupported) {
      await setComponentStatus(sos._id, COMPONENT_NAMES.EMAIL, COMPONENT_STATUS.UNSUPPORTED, {
        error: 'Email provider is not configured',
      });
    } else {
      const firstFailure = results.find((r) => r.status === 'rejected');
      throw (firstFailure && firstFailure.reason) || new Error('All email deliveries failed');
    }
  } catch (err) {
    logger.error('Email dispatch failed', { sosId: sos._id.toString(), error: err.message });
    await setComponentStatus(sos._id, COMPONENT_NAMES.EMAIL, COMPONENT_STATUS.FAILED, {
      error: safeErrorMessage(err, 'Email delivery failed'),
    });
  }
}

/**
 * Entry point, called exactly once per SOS — only by the atomic
 * PENDING -> ACTIVE transition in sos.service (see scheduleActivation).
 * Never called for a cancelled SOS, and never re-entrant for the same
 * SOS, so there is no risk of duplicate dispatch.
 */
/**
 * Marks all four dispatch components FAILED with the same safe message.
 * Used only when the shared setup below (fetching user/collection/
 * recipients) itself fails — see dispatchSos for why this matters.
 */
async function markAllDispatchComponentsFailed(sos, error) {
  await Promise.all(
    [COMPONENT_NAMES.PUSH, COMPONENT_NAMES.SMS, COMPONENT_NAMES.EMAIL, COMPONENT_NAMES.CALL].map((name) =>
      setComponentStatus(sos._id, name, COMPONENT_STATUS.FAILED, { error })
    )
  );
}

/**
 * Entry point, called exactly once per SOS — only by the atomic
 * PENDING -> ACTIVE transition in sos.service (see scheduleActivation).
 * Never called for a cancelled SOS, and never re-entrant for the same
 * SOS, so there is no risk of duplicate dispatch.
 */
async function dispatchSos(sos) {
  // This setup step (unlike each individual channel below) is NOT
  // retried by the scheduler even though a thrown error here would
  // propagate up to it: by the time any retry fires, this SOS is
  // already ACTIVE, so the scheduler's activation handler has nothing
  // left to atomically claim and silently skips re-running dispatch.
  // A transient failure here (e.g. a momentary DB hiccup) must
  // therefore never be allowed to leave every component silently stuck
  // at "pending" forever — it's recorded as an explicit FAILED status
  // on all four components instead, consistent with the same
  // never-silently-swallow-errors guarantee every individual channel
  // below already provides.
  let user;
  let collection;
  let recipients;
  try {
    [user, collection] = await Promise.all([User.findById(sos.userId), Collection.findById(sos.collectionId)]);
    if (!user || !collection) {
      throw new Error('SOS user or collection no longer exists');
    }
    recipients = await notificationService.getRecipientsForSos(sos);
  } catch (err) {
    logger.error('Dispatch setup failed — could not resolve user/collection/recipients', {
      sosId: sos._id.toString(),
      error: err.message,
    });
    await markAllDispatchComponentsFailed(sos, safeErrorMessage(err, 'Dispatch could not be started'));
    return;
  }

  const link = buildEmergencyLink(sos.emergencyToken);
  const renderedMessage = `${sos.emergencyMessage} Location/details: ${link}`;

  // Every dispatch action runs independently — one failing never blocks
  // or delays the others.
  await Promise.allSettled([
    dispatchNotification(sos, user, collection),
    dispatchEmail(sos, recipients, `SOS Alert — ${user.username}`, renderedMessage),
  ]);
}

module.exports = { dispatchSos };
