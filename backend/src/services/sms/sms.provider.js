const logger = require('../../config/logger');
const env = require('../../config/env');

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

/**
 * SMS provider abstraction. Business logic (dispatch.service) calls only
 * `send()` — it never knows or cares which underlying gateway is used.
 *
 * REAL IMPLEMENTATION: calls the Twilio Messages REST API directly via
 * Node's built-in `fetch` (Node 18+, no SDK dependency needed). Twilio
 * is a plain HTTPS REST API authenticated with HTTP Basic Auth using the
 * Account SID/Auth Token, so no external package is required.
 *
 * When credentials are absent, the provider reports that SMS delivery is
 * unsupported. It never reports a message as sent without contacting Twilio.
 *
 * UNVERIFIED IN THIS ENVIRONMENT: this integration was written against
 * Twilio's documented REST API contract but has not been exercised
 * against a live Twilio account (no network access in the environment
 * this was built in) — test with real credentials before relying on it.
 */
function isConfigured() {
  return !!(env.sms.accountSid && env.sms.authToken && env.sms.fromNumber);
}

async function sendViaTwilio({ to, body }) {
  const url = `${TWILIO_API_BASE}/Accounts/${env.sms.accountSid}/Messages.json`;
  const auth = Buffer.from(`${env.sms.accountSid}:${env.sms.authToken}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: env.sms.fromNumber, Body: body });

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
    throw new Error(payload.message || `SMS provider request failed with status ${response.status}`);
  }
  return { status: 'sent', providerMessageId: payload.sid };
}

async function send({ to, body }) {
  if (!isConfigured()) {
    logger.warn('SMS provider not configured (SMS_ACCOUNT_SID/SMS_AUTH_TOKEN/SMS_FROM_NUMBER)', {
      to,
    });
    return { status: 'unsupported', error: 'SMS provider is not configured' };
  }
  return sendViaTwilio({ to, body });
}

module.exports = { send, isConfigured };
