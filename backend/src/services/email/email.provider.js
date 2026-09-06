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

function isConfigured() {
  return !isPlaceholder(env.email.host) && !isPlaceholder(env.email.user) && !isPlaceholder(env.email.password);
}

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user: env.email.user, pass: env.email.password },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 60000,
    });
  }
  return cachedTransporter;
}

async function send({ to, subject, body }) {
  if (!isConfigured()) {
    logger.warn('Email provider not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD)', {
      to,
      subject,
    });
    return { status: 'unsupported', error: 'Email provider is not configured' };
  }

  try {
    const transporter = getTransporter();
    // sendMail performs the real SMTP connection/authentication/transaction.
    // Avoid a separate verify() round-trip for every recipient; during an
    // emergency that extra handshake can itself time out and falsely report
    // the email as undelivered.
    const info = await transporter.sendMail({
      from: env.email.from,
      to,
      subject,
      text: body,
    });
    return { status: 'sent', providerMessageId: info.messageId, response: info.response || null };
  } catch (err) {
    logger.warn('Email send failed', { to, subject, error: err.message });
    throw err;
  }
}

module.exports = { send, isConfigured };
