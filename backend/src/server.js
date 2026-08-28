const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const schedulerService = require('./modules/scheduler/scheduler.service');
const smsProvider = require('./services/sms/sms.provider');
const emailProvider = require('./services/email/email.provider');
const callProvider = require('./services/call/call.provider');
const pushProvider = require('./services/push/push.provider');

const SHUTDOWN_FORCE_EXIT_MS = 10_000;

let server;

/**
 * Each provider already logs its own WARN + falls back to a stub on
 * every individual send when unconfigured (see each *.provider.js) —
 * that's sufficient for dev/test. This is a one-time, boot-level signal
 * specifically for production: an operator who deploys with
 * NODE_ENV=production but forgot to set real credentials should see
 * this immediately in their startup logs, not discover it only when a
 * real emergency's dispatch silently no-ops. Purely diagnostic — never
 * blocks boot, never changes any provider's runtime behavior.
 */
function warnIfProvidersUnconfiguredInProduction() {
  if (env.nodeEnv !== 'production') return;

  const unconfigured = [
    !smsProvider.isConfigured() && 'SMS (Twilio)',
    !emailProvider.isConfigured() && 'Email (SMTP)',
    !callProvider.isConfigured() && 'Emergency call (Twilio Voice)',
    !pushProvider.isConfigured() && 'Push (FCM)',
  ].filter(Boolean);

  if (unconfigured.length > 0) {
    logger.warn(
      'Running with NODE_ENV=production but one or more dispatch providers are unconfigured — real SOS dispatch will silently fall back to a log-only stub for these channels',
      { unconfiguredProviders: unconfigured }
    );
  }
}

async function start() {
  await connectDB();
  warnIfProvidersUnconfiguredInProduction();

  // Handler registration happens as a side effect of requiring app.js
  // above (app -> routes -> sos.routes -> sos.controller -> sos.service,
  // which registers its job handlers at module load). Starting the
  // poller only after connectDB() ensures it never runs before the DB
  // is ready. This is the only place the scheduler is started — never
  // from a controller or from app.js itself, so it stays out of the
  // request/response path entirely.
  schedulerService.start();

  server = app.listen(env.port, () => {
    logger.info(`${env.appName} listening on port ${env.port} [${env.nodeEnv}]`);
  });
}

function shutdown(signal) {
  return async () => {
    logger.info(`${signal} received, shutting down gracefully`);
    schedulerService.stop();

    // Safety net: if server.close() never calls back (e.g. a stuck
    // in-flight connection, such as a long media stream that never
    // ends), force-exit rather than hang forever and block an
    // orchestrator's restart/redeploy.
    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, SHUTDOWN_FORCE_EXIT_MS);
    forceExitTimer.unref();

    if (server) {
      server.close(async () => {
        clearTimeout(forceExitTimer);
        await disconnectDB();
        logger.info('Shutdown complete');
        process.exit(0);
      });
    } else {
      clearTimeout(forceExitTimer);
      process.exit(0);
    }
  };
}

process.on('SIGTERM', shutdown('SIGTERM'));
process.on('SIGINT', shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason && reason.message ? reason.message : reason });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

start();

module.exports = app;
