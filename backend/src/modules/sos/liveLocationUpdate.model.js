const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Individual live-location pings for an active SOS session.
 *
 * DESIGN DECISION: kept as its own collection rather than an
 * ever-growing array on the Sos document. Live tracking can produce many
 * pings over a session; embedding them directly in the SOS doc would
 * make that document unbounded and create write contention with the
 * other SOS updates (component status, cancellation, etc.) happening at
 * the same time. The SOS document only caches `liveLocation.lastLocation`
 * for quick access — the full ping history lives here.
 */
const liveLocationUpdateSchema = new Schema(
  {
    sosId: {
      type: Schema.Types.ObjectId,
      ref: 'Sos',
      required: true,
    },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    accuracy: { type: Number, default: null },
    capturedAt: { type: Date, required: true },
    source: { type: String, default: null },
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

liveLocationUpdateSchema.index({ sosId: 1, capturedAt: -1 });

const LiveLocationUpdate = mongoose.model('LiveLocationUpdate', liveLocationUpdateSchema);

module.exports = LiveLocationUpdate;
