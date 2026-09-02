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
function isConfigured() {
  return !!(env.email.host && env.email.user && env.email.password);
}

let cachedTransporter = null;
function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.port === 465, // implicit TLS on 465; STARTTLS otherwise
      auth: { user: env.email.user, pass: env.email.password },
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
    // Add a 10-second timeout to prevent email from blocking the entire SOS activation
    const sendPromise = getTransporter().sendMail({
      from: env.email.from,
      to,
      subject,
      text: body,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout after 10 seconds')), 10000)
    );

    const info = await Promise.race([sendPromise, timeoutPromise]);
    return { status: 'sent', providerMessageId: info.messageId };
  } catch (err) {
    logger.warn('Email send failed', { to, subject, error: err.message });
    throw err;
  }
}

module.exports = { send, isConfigured };
