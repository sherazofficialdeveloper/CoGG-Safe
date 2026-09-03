const env = require('./config/env');
const logger = require('./config/logger');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const schedulerService = require('./modules/scheduler/scheduler.service');
const emailProvider = require('./services/email/email.provider');
const pushProvider = require('./services/push/push.provider');

const SHUTDOWN_FORCE_EXIT_MS = 10_000;

let server;

/**
 * Each provider logs a warning when it is unconfigured and returns an
 * explicit unsupported result instead of claiming delivery. This remains
 * purely diagnostic for production boot: it makes missing credentials clear
 * at startup without fabricating a working provider.
 */
/**
 * Each provider logs a warning when it is unconfigured and returns an
 * explicit unsupported result instead of claiming delivery. This remains
 * purely diagnostic for production boot: it makes missing credentials clear
 * at startup without fabricating a working provider.
 *
 * BUG FIX: this used to only run when NODE_ENV=production, so in normal
 * local/dev testing (NODE_ENV=development, per backend/.env.example) it
 * silently never warned — "notifications don't work" had zero startup
 * signal pointing at missing Firebase/SMTP credentials. It now warns in any
 * non-test environment, since dev/staging need this visibility just as much.
 */
function warnIfProvidersUnconfigured() {
  if (env.nodeEnv === 'test') return;

  const unconfigured = [
    !emailProvider.isConfigured() && 'Email (SMTP)',
    !pushProvider.isConfigured() && 'Push (FCM)',
  ].filter(Boolean);

  if (unconfigured.length > 0) {
    logger.warn(
      `Running with NODE_ENV=${env.nodeEnv} but one or more dispatch providers are unconfigured — push notifications and/or email will silently report "unsupported" for every SOS until real credentials are set in backend/.env (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY for push, EMAIL_HOST/EMAIL_USER/EMAIL_PASSWORD for email).`,
      { unconfiguredProviders: unconfigured }
    );
  }
}

async function start() {
  try {
    console.log('[DEBUG 1] start() called');

    console.log('[DEBUG 2] connecting DB...');
    await connectDB();
    console.log('[DEBUG 3] DB connected');

    console.log('[DEBUG 4] checking providers...');
    warnIfProvidersUnconfigured();
    console.log('[DEBUG 5] providers checked');

    console.log('[DEBUG 6] starting scheduler...');
    schedulerService.start();
    console.log('[DEBUG 7] scheduler started');

    console.log('[DEBUG 8] starting HTTP server...');

    // Railway requires the server to listen on the provided PORT
    // and bind to all network interfaces.
    server = app.listen(env.port, '0.0.0.0', () => {
      console.log(`[DEBUG 9] SERVER LISTENING ON PORT ${env.port}`);
      logger.info(`${env.appName} listening on port ${env.port} [${env.nodeEnv}]`);
    });

    server.on('error', error => {
      console.error('[DEBUG SERVER ERROR]', error);
    });

  } catch (err) {
    console.error('[DEBUG START ERROR]', err);
    logger.error('Failed to start the application server', {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
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
  logger.error('Unhandled promise rejection', {
    reason: reason && reason.message ? reason.message : reason,
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', {
    error: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

start();

module.exports = app;
