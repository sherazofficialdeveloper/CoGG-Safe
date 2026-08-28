const admin = require('firebase-admin');
const logger = require('../../config/logger');
const env = require('../../config/env');

/**
 * Push provider abstraction — the low-level "send to one device token"
 * primitive. Fan-out across a user's multiple devices, and any
 * per-recipient bookkeeping, is the caller's job (dispatch.service) —
 * this file only knows how to talk to FCM for a single token.
 *
 * REAL IMPLEMENTATION: uses `firebase-admin` (already a dependency since
 * Phase 1) against FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/
 * FIREBASE_PRIVATE_KEY. This is the correct approach for FCM specifically
 * — its HTTP v1 API requires signed OAuth2 service-account requests,
 * which the SDK handles; hand-rolling that (unlike the plain-REST
 * Twilio calls) would be substantially riskier.
 *
 * TOKEN CLEANUP: when FCM reports a token as no longer valid
 * (uninstalled app, expired registration), this throws an error tagged
 * with `code: INVALID_TOKEN_ERROR_CODE` instead of a generic error —
 * dispatch.service catches that specific code and removes the token via
 * pushToken.service.removeTokenByValue, so stale tokens don't
 * accumulate. This is exactly the "notification business logic doesn't
 * change when the real provider is connected" seam requested.
 *
 * When Firebase credentials are absent, the provider reports that push
 * delivery is unsupported. It never reports a notification as sent locally.
 *
 * UNVERIFIED IN THIS ENVIRONMENT: written against firebase-admin's
 * documented API but not exercised against a live Firebase project (no
 * network access in the build environment) — test with real credentials
 * before relying on it.
 */
const INVALID_TOKEN_ERROR_CODE = 'INVALID_TOKEN';

const FCM_INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
]);

function isConfigured() {
  return !!(env.firebase.projectId && env.firebase.clientEmail && env.firebase.privateKey);
}

let firebaseApp = null;
function getApp() {
  if (!firebaseApp) {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: env.firebase.projectId,
        clientEmail: env.firebase.clientEmail,
        privateKey: env.firebase.privateKey,
      }),
    });
  }
  return firebaseApp;
}

/** FCM's `data` payload requires every value to be a string. */
function stringifyDataPayload(data) {
  if (!data) return undefined;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)]));
}

async function sendToToken({ token, title, body, data }) {
  if (!isConfigured()) {
    logger.warn(
      'Push provider not configured (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)',
      { token }
    );
    return { status: 'unsupported', error: 'Push provider is not configured' };
  }

  try {
    const messageId = await admin.messaging(getApp()).send({
      token,
      notification: { title, body },
      data: stringifyDataPayload(data),
    });
    return { status: 'sent', providerMessageId: messageId };
  } catch (err) {
    if (FCM_INVALID_TOKEN_CODES.has(err.code)) {
      const wrapped = new Error('Push token is no longer valid');
      wrapped.code = INVALID_TOKEN_ERROR_CODE;
      throw wrapped;
    }
    throw err;
  }
}

module.exports = { sendToToken, isConfigured, INVALID_TOKEN_ERROR_CODE };
