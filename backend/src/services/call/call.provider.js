const logger = require('../../config/logger');
const env = require('../../config/env');

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * Emergency call provider abstraction. `initiate()` means "the call was
 * successfully handed off to the provider" — NOT "the call was
 * answered". Confirming an answered/completed call requires provider
 * status-callback webhooks, which are out of scope (no publicly
 * reachable webhook endpoint is set up in this phase); the model
 * (components.call) only tracks initiation success/failure so we never
 * claim a call was completed when it wasn't.
 *
 * REAL IMPLEMENTATION: calls the Twilio Voice REST API via built-in
 * `fetch`, same pattern as sms.provider.js. Twilio requires a TwiML URL
 * telling it what the call should say/do once answered — that must be
 * configured by the operator (CALL_TWIML_URL); this backend has no way
 * to generate call instructions itself, so a missing TwiML URL is
 * treated as a configuration error, not silently ignored.
 *
 * When credentials or CALL_TWIML_URL are absent, the provider reports that
 * call initiation is unsupported. It never claims a call was initiated.
 *
 * UNVERIFIED IN THIS ENVIRONMENT: written against Twilio's documented
 * Voice REST API but not exercised against a live account — test with
 * real credentials before relying on it.
 */
function isConfigured() {
  return !!(env.call.accountSid && env.call.authToken && env.call.fromNumber && env.call.twimlUrl);
}

async function initiateViaTwilio({ to }) {
  const url = `${TWILIO_API_BASE}/Accounts/${env.call.accountSid}/Calls.json`;
  const auth = Buffer.from(`${env.call.accountSid}:${env.call.authToken}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: env.call.fromNumber, Url: env.call.twimlUrl });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Truthfully record whatever Twilio reported (e.g. network/carrier
    // issue, invalid number) rather than pretending the call happened.
    throw new Error(payload.message || `Call provider request failed with status ${response.status}`);
  }
  return { status: 'initiated', providerCallId: payload.sid };
}

async function initiate({ to }) {
  if (!isConfigured()) {
    logger.warn(
      'Call provider not configured (CALL_ACCOUNT_SID/CALL_AUTH_TOKEN/CALL_FROM_NUMBER/CALL_TWIML_URL)',
      { to }
    );
    return { status: 'unsupported', error: 'Call provider is not configured' };
  }
  return initiateViaTwilio({ to });
}

module.exports = { initiate, isConfigured };
