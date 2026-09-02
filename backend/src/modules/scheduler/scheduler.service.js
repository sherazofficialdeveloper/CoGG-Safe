const ScheduledJob = require('./scheduledJob.model');
const logger = require('../../config/logger');
const env = require('../../config/env');

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = 10_000;
const CLAIM_BATCH_SIZE = 20;

/**
 * type -> async handler(payload). Registered by whichever module owns
 * the job type (currently only sos.service, for SOS_ACTIVATION and
 * LIVE_LOCATION_EXPIRY) — this file has zero SOS-specific knowledge,
 * which is exactly what keeps the state machine independent from the
 * scheduler implementation.
 */
const handlers = new Map();

function registerHandler(type, handlerFn) {
  handlers.set(type, handlerFn);
}

/**
 * Persists a durable job. This is the ONLY thing callers need — no
 * setTimeout, no in-memory bookkeeping. If the process restarts before
 * `runAt`, the job is still sitting in MongoDB and will run on the next
 * poll after boot.
 */
async function scheduleJob(type, payload, runAt) {
  return ScheduledJob.create({ type, payload, runAt, status: ScheduledJob.JOB_STATUS.PENDING });
}

/**
 * Best-effort cleanup: marks any still-pending jobs matching a type +
 * payload field as cancelled (e.g. the SOS_ACTIVATION job for an SOS
 * that just got cancelled by its owner). This is NOT the source of
 * correctness — the handlers themselves use atomic, state-conditional
 * DB updates (see sos.service.activateSosIfPending /
 * expireLiveLocationIfActive) so a job that slips through before
 * cancellation lands here is still a safe no-op when it runs. This just
 * avoids doing pointless work and keeps the job collection tidy.
 */
async function cancelJobsForSos(type, sosId) {
  await ScheduledJob.updateMany(
    { type, 'payload.sosId': String(sosId), status: ScheduledJob.JOB_STATUS.PENDING },
    { $set: { status: ScheduledJob.JOB_STATUS.CANCELLED } }
  );
}

/**
 * Atomically claims one due, pending job (status pending -> processing)
 * so that if multiple poll ticks or instances race, exactly one of them
 * gets each job. Returns null when there's nothing due.
 */
async function claimNextDueJob() {
  return ScheduledJob.findOneAndUpdate(
    { status: ScheduledJob.JOB_STATUS.PENDING, runAt: { $lte: new Date() } },
    { $set: { status: ScheduledJob.JOB_STATUS.PROCESSING } },
    { new: true, sort: { runAt: 1 } }
  );
}

async function processJob(job) {
  const handler = handlers.get(job.type);
  if (!handler) {
    logger.error('No scheduler handler registered for job type', { type: job.type, jobId: job._id.toString() });
    await ScheduledJob.updateOne(
      { _id: job._id },
      { $set: { status: ScheduledJob.JOB_STATUS.FAILED, lastError: 'No handler registered' } }
    );
    return;
  }

  try {
    await handler(job.payload);
    await ScheduledJob.updateOne({ _id: job._id }, { $set: { status: ScheduledJob.JOB_STATUS.COMPLETED } });
  } catch (err) {
    logger.error('Scheduled job handler failed', { type: job.type, jobId: job._id.toString(), error: err.message });
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await ScheduledJob.updateOne(
        { _id: job._id },
        { $set: { status: ScheduledJob.JOB_STATUS.FAILED, attempts, lastError: err.message } }
      );
    } else {
      // Retry shortly, rather than immediately, to avoid hammering a
      // transiently-failing dependency.
      await ScheduledJob.updateOne(
        { _id: job._id },
        {
          $set: {
            status: ScheduledJob.JOB_STATUS.PENDING,
            attempts,
            lastError: err.message,
            runAt: new Date(Date.now() + RETRY_BACKOFF_MS),
          },
        }
      );
    }
  }
}

let pollTimer = null;
let isProcessing = false; // guards against overlapping poll ticks on a slow batch

async function processDueJobs() {
  if (isProcessing) return;
  isProcessing = true;
  try {
    for (let i = 0; i < CLAIM_BATCH_SIZE; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const job = await claimNextDueJob();
      if (!job) break;
      // eslint-disable-next-line no-await-in-loop
      await processJob(job);
    }
  } catch (err) {
    logger.error('Scheduler poll tick failed', { error: err.message });
  } finally {
    isProcessing = false;
  }
}

/**
 * Starts the poller. Called once from server.js after the DB connects —
 * never from a controller (per the architecture rule: scheduler logic
 * stays out of the request/response path entirely).
 */
function start() {
  if (pollTimer) return; // already running
  pollTimer = setInterval(processDueJobs, env.scheduler.pollIntervalMs);
  pollTimer.unref();
  logger.info('Scheduler started', { pollIntervalMs: env.scheduler.pollIntervalMs });
  console.log('[SOS_DEBUG] SCHEDULER_STARTED', { pollIntervalMs: env.scheduler.pollIntervalMs });
}

function stop() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = {
  registerHandler,
  scheduleJob,
  cancelJobsForSos,
  processDueJobs,
  start,
  stop,
};
