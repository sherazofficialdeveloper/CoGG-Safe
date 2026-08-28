const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A durable, persisted job: "run this handler, for this payload, at or
 * after this time." Backed by MongoDB rather than an in-process timer,
 * so a scheduled transition (SOS activation, live-location expiry)
 * survives a server restart — the poller in scheduler.service picks up
 * any due job on the next tick after boot, regardless of how the
 * process was interrupted.
 *
 * `type` is intentionally generic (not SOS-specific) — this collection
 * and its poller are reusable scheduler infrastructure; only the two
 * type values currently registered (see sos.service.js) are SOS-specific.
 */
const JOB_STATUS = Object.freeze({
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  FAILED: 'failed',
});

const scheduledJobSchema = new Schema(
  {
    type: {
      type: String,
      required: true,
    },
    // Arbitrary small payload identifying what the job acts on
    // (e.g. { sosId }). Kept schemaless since different job types need
    // different shapes, and this collection has no business logic of
    // its own beyond "run type X with payload Y at runAt".
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
    runAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.PENDING,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Primary access pattern: "find due pending jobs", ordered by run time.
scheduledJobSchema.index({ status: 1, runAt: 1 });
// Used to cancel a job for a specific entity (e.g. an SOS being cancelled).
scheduledJobSchema.index({ type: 1, 'payload.sosId': 1, status: 1 });

const ScheduledJob = mongoose.model('ScheduledJob', scheduledJobSchema);

module.exports = ScheduledJob;
module.exports.JOB_STATUS = JOB_STATUS;
