const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * A single recipient's notification for a specific SOS.
 *
 * DESIGN DECISION: "is this notification still active" is NOT a stored
 * flag here — it's derived from the referenced SOS's own `status` at
 * read time (see notification.service.listForUser). Duplicating an
 * active/inactive flag on every notification row would let it drift out
 * of sync with the SOS it describes; the SOS document is the single
 * source of truth for that state, exactly as it already is for
 * cancellation/deactivation.
 */
const notificationSchema = new Schema(
  {
    sosId: {
      type: Schema.Types.ObjectId,
      ref: 'Sos',
      required: true,
    },
    recipientUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        if (ret._id) ret.id = ret._id.toString();
        if (ret.sosId && ret.sosId.id && !ret.sosId._id) {
          ret.sosId._id = ret.sosId.id;
        }
        return ret;
      },
    },
  }
);

notificationSchema.index({ recipientUserId: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, isRead: 1 });
notificationSchema.index({ sosId: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
