const mongoose = require('mongoose');

const { Schema } = mongoose;

const PLATFORMS = Object.freeze({
  IOS: 'ios',
  ANDROID: 'android',
  WEB: 'web',
});

/**
 * One registered device/installation's FCM token per document.
 *
 * DESIGN DECISIONS:
 *   - `token` is globally unique, not user-scoped: a device token
 *     identifies one specific app installation. If a different user
 *     logs into the same device, re-registering the same token
 *     reassigns it (see pushToken.service.registerToken) — this is
 *     what makes logout/login-as-someone-else on a shared device work
 *     correctly, so the previous user stops receiving that device's
 *     pushes.
 *   - Multiple documents per userId are expected and supported (a user
 *     with a phone AND a tablet gets two rows) — "multiple devices" is
 *     just "more than one row with the same userId", no special
 *     multi-device field is needed.
 */
const pushTokenSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: Object.values(PLATFORMS),
      required: true,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.__v;
        delete ret.token; // never echoed back in API responses
        return ret;
      },
    },
  }
);

pushTokenSchema.index({ userId: 1 });

const PushToken = mongoose.model('PushToken', pushTokenSchema);

module.exports = PushToken;
module.exports.PLATFORMS = PLATFORMS;
