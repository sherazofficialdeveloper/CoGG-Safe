const nodemailer = require('nodemailer');
const logger = require('../../config/logger');
const env = require('../../config/env');

/**
 * Email provider abstraction.
 *
 * REAL IMPLEMENTATION: sends via SMTP using nodemailer, configured from
 * the existing EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASSWORD env vars
 * (already modeled in env.js since Phase 1). nodemailer is the
 * industry-standard library for this exact job — hand-rolling the SMTP
 * protocol would be far riskier than using a well-established package.
 *
 * When SMTP credentials are absent, the provider reports that email
 * delivery is unsupported. It never reports a message as sent locally.
 *
 * UNVERIFIED IN THIS ENVIRONMENT: written against nodemailer's
 * documented API and standard SMTP behavior, but not exercised against
 * a live mail server (no network access in the build environment) —
 * test with real credentials before relying on it.
 */
function isPlaceholder(value) {
  return !value || /YOUR_|CHANGE_ME|example\.com|placeholder|your_/i.test(String(value));
}

function isValidRecipientEmail(value) {
  const email = String(value || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isPlaceholder(email);
}

function isConfigured() {
  const provider = String(env.email.provider || 'smtp').toLowerCase();
  if (provider === 'resend') {
    return !isPlaceholder(env.email.resendApiKey) && !isPlaceholder(env.email.from);
  }
  return !isPlaceholder(env.email.host) && !isPlaceholder(env.email.user) && !isPlaceholder(env.email.password);
}

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465,
      auth: { user: env.email.user, pass: env.email.password },
      connectionTimeout: 30000,
      greetingTimeout: 30000,
      socketTimeout: 120000,
    });
  }
  return cachedTransporter;
}

async function sendViaResend({ to, subject, body }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${String(env.email.resendBaseUrl).replace(/\/$/, '')}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.email.resendApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ from: env.email.from, to: [to], subject, text: body }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.message || payload?.name || `Resend HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return { status: 'sent', providerMessageId: payload?.id || null, response: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function send({ to, subject, body }) {
  if (!isValidRecipientEmail(to)) {
    const error = new Error('Email recipient is missing, malformed, or a placeholder address');
    error.code = 'EMAIL_INVALID_RECIPIENT';
    logger.warn('Email send rejected because the recipient is invalid', {
      provider: env.email.provider,
      subject,
    });
    throw error;
  }

  if (!isConfigured()) {
    logger.warn('Email provider is not configured', { provider: env.email.provider, to, subject });
    return { status: 'unsupported', error: 'Email provider is not configured' };
  }

  try {
    if (String(env.email.provider || 'smtp').toLowerCase() === 'resend') {
      return await sendViaResend({ to, subject, body });
    }

    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: env.email.from,
      to,
      subject,
      text: body,
    });
    return { status: 'sent', providerMessageId: info.messageId, response: info.response || null };
  } catch (err) {
    logger.warn('Email send failed', { provider: env.email.provider, to, subject, error: err.message });
    throw err;
  }
}

module.exports = { send, isConfigured, isValidRecipientEmail };
