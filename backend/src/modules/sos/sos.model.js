const mongoose = require('mongoose');

const { Schema } = mongoose;
const {
  SOS_STATUS,
  COMPONENT_STATUS,
  LIVE_LOCATION_STATUS,
  COMPONENT_NAMES,
} = require('../../constants/sosConstants');

/**
 * Reusable shape for every dispatch-related component (sms, email, push,
 * call) and every media component (frontImage, backImage, audio).
 * Defined once and reused for all seven components below instead of
 * repeating the same {status, error, updatedAt} block seven times.
 */
function componentSubSchema({ withStorageRef = false } = {}) {
  const fields = {
    status: { type: String, enum: Object.values(COMPONENT_STATUS), default: COMPONENT_STATUS.PENDING },
    error: { type: String, default: null }, // safe, human-readable message only — never a stack trace
    updatedAt: { type: Date, default: null },
  };
  if (withStorageRef) {
    // Reference into the storage abstraction (e.g. an object key/URL),
    // never the binary media itself — see src/services/storage.
    fields.storageRef = { type: String, default: null };
    // Needed to serve the file back with the correct Content-Type —
    // recorded from the upload itself, never trusted from elsewhere.
    fields.mimeType = { type: String, default: null };
  }
  return new Schema(fields, { _id: false });
}

const locationSchema = new Schema(
  {
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    capturedAt: { type: Date, default: null },
    status: { type: String, enum: Object.values(COMPONENT_STATUS), default: COMPONENT_STATUS.PENDING },
    error: { type: String, default: null },
  },
  { _id: false }
);

const liveLocationSchema = new Schema(
  {
    status: {
      type: String,
      enum: [...Object.values(LIVE_LOCATION_STATUS), 'not_started'],
      default: 'not_started',
    },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    // Server-computed cutoff = startedAt + env.sos.liveLocationMaxDurationHours.
    // This is ONLY the live-tracking cutoff — never the emergency link's
    // expiry (the link itself never expires on a timer; see emergencyLink.service).
    expiresAt: { type: Date, default: null },
    lastLocation: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      capturedAt: { type: Date, default: null },
    },
  },
  { _id: false }
);

const sosSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Snapshot of the user's collection at SOS creation time — resolved
    // server-side from the authenticated user's own record, NEVER from
    // the request body. One user belongs to one collection (Phase 3),
    // so this is stable, but storing it here keeps the SOS record
    // self-describing even if that relationship changes in the future.
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SOS_STATUS),
      default: SOS_STATUS.PENDING,
      required: true,
    },
    // Resolved once at creation time (user's custom message, or the
    // global default template with their username interpolated) so the
    // emergency record is self-contained even if the user edits their
    // saved message later.
    emergencyMessage: {
      type: String,
      required: true,
    },
    // Secure random public identifier for the emergency link. Deliberately
    // NOT the Mongo _id, so the public link never exposes a raw database id.
    emergencyToken: {
      type: String,
      required: true,
      unique: true,
    },
    // Optional client-generated key for offline-sync idempotency. Scoped
    // per-user (not globally unique) — see sos.service.createSos.
    idempotencyKey: {
      type: String,
      default: undefined,
    },

    activatedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    deactivatedAt: { type: Date, default: null },
    deactivatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    location: { type: locationSchema, default: () => ({}) },
    liveLocation: { type: liveLocationSchema, default: () => ({}) },

    components: {
      type: new Schema(
        {
          frontImage: { type: componentSubSchema({ withStorageRef: true }), default: () => ({}) },
          backImage: { type: componentSubSchema({ withStorageRef: true }), default: () => ({}) },
          audio: { type: componentSubSchema({ withStorageRef: true }), default: () => ({}) },
          sms: { type: componentSubSchema(), default: () => ({}) },
          email: { type: componentSubSchema(), default: () => ({}) },
          push: { type: componentSubSchema(), default: () => ({}) },
          call: { type: componentSubSchema(), default: () => ({}) },
          backend: { type: componentSubSchema(), default: () => ({}) },
        },
        { _id: false }
      ),
      default: () => ({}),
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        // Keep the API contract independent of Mongoose's internal `_id`
        // representation. Mobile navigation and notification payloads use
        // `id`; the database identifier is never part of the public shape.
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.emergencyToken; // never exposed via the normal authenticated API surface
        return ret;
      },
    },
  }
);

// Database-level race-condition backstop for concurrent create requests.
sosSchema.index(
  { userId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [SOS_STATUS.PENDING, SOS_STATUS.ACTIVE] } },
    name: 'one_open_sos_per_user',
  }
);
sosSchema.index({ userId: 1, createdAt: -1 });
sosSchema.index({ collectionId: 1 });
sosSchema.index({ status: 1 });
sosSchema.index({ createdAt: -1 });
sosSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

const Sos = mongoose.model('Sos', sosSchema);

module.exports = Sos;
module.exports.COMPONENT_NAMES = COMPONENT_NAMES;
