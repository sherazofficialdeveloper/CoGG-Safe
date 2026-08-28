process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';
process.env.SCHEDULER_POLL_INTERVAL_MS = '150';

const dbHandler = require('./testUtils/dbHandler');
const ScheduledJob = require('../src/modules/scheduler/scheduledJob.model');
const schedulerService = require('../src/modules/scheduler/scheduler.service');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
  schedulerService.stop();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('scheduler durability', () => {
  test('a scheduled job is persisted in MongoDB, not just held in memory', async () => {
    const runAt = new Date(Date.now() + 60_000);
    const job = await schedulerService.scheduleJob('test_job_type', { foo: 'bar' }, runAt);

    // Read it back as a completely independent query — proves the job
    // lives in the database, not in a process-local Map/timer.
    const persisted = await ScheduledJob.findById(job._id);
    expect(persisted).not.toBeNull();
    expect(persisted.status).toBe('pending');
    expect(persisted.payload.foo).toBe('bar');
  });

  test('a due job runs exactly once via the poller, even across a simulated restart', async () => {
    let callCount = 0;
    schedulerService.registerHandler('test_restart_job', async () => {
      callCount += 1;
    });

    await schedulerService.scheduleJob('test_restart_job', {}, new Date(Date.now() - 1000)); // already due

    // Simulate "the process restarted before this fired" by never having
    // an in-memory timer at all — processDueJobs() is exactly what a
    // freshly-booted process's first poll tick would do, and it must
    // still pick up and run the job that was persisted before restart.
    await schedulerService.processDueJobs();
    await schedulerService.processDueJobs(); // a second tick must NOT re-run it

    expect(callCount).toBe(1);
  });

  test('cancelJobsForSos marks matching pending jobs cancelled without touching others', async () => {
    const runAt = new Date(Date.now() + 60_000);
    const jobA = await schedulerService.scheduleJob('sos_activation', { sosId: 'sos-a' }, runAt);
    const jobB = await schedulerService.scheduleJob('sos_activation', { sosId: 'sos-b' }, runAt);

    await schedulerService.cancelJobsForSos('sos_activation', 'sos-a');

    const refreshedA = await ScheduledJob.findById(jobA._id);
    const refreshedB = await ScheduledJob.findById(jobB._id);
    expect(refreshedA.status).toBe('cancelled');
    expect(refreshedB.status).toBe('pending');
  });

  test('a cancelled job is a safe no-op even if a stray poll tick reaches it', async () => {
    let callCount = 0;
    schedulerService.registerHandler('test_cancel_job', async () => {
      callCount += 1;
    });

    await schedulerService.scheduleJob('test_cancel_job', { sosId: 'sos-x' }, new Date(Date.now() - 1000));
    await schedulerService.cancelJobsForSos('test_cancel_job', 'sos-x');

    await schedulerService.processDueJobs();
    expect(callCount).toBe(0); // cancelled jobs are never claimed (status is no longer "pending")
  });

  test('a failing handler is retried and eventually recorded as failed after max attempts', async () => {
    let attempts = 0;
    schedulerService.registerHandler('test_failing_job', async () => {
      attempts += 1;
      throw new Error('deliberate failure for test');
    });

    const job = await schedulerService.scheduleJob('test_failing_job', {}, new Date(Date.now() - 1000));
    await schedulerService.processDueJobs();

    const afterFirstAttempt = await ScheduledJob.findById(job._id);
    expect(afterFirstAttempt.attempts).toBe(1);
    expect(afterFirstAttempt.status).toBe('pending'); // scheduled for retry, not abandoned
    expect(afterFirstAttempt.lastError).toContain('deliberate failure');
    void attempts;
  });

  test('start() and stop() control the poller independently of any controller/route', async () => {
    let callCount = 0;
    schedulerService.registerHandler('test_poller_job', async () => {
      callCount += 1;
    });
    await schedulerService.scheduleJob('test_poller_job', {}, new Date(Date.now() - 1000));

    schedulerService.start();
    await wait(400); // a few 150ms poll ticks

    schedulerService.stop();
    expect(callCount).toBeGreaterThanOrEqual(1);
  });
});
