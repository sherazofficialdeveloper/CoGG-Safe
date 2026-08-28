const mongoose = require('mongoose');

const { Schema } = mongoose;
const { ALL_ROLES, ROLES } = require('../../constants/roles');
const { USER_STATUS } = require('../../constants/sosConstants');
const { hashPassword, comparePassword } = require('../../utils/password');

/**
 * Core User entity.
 *
 * SECURITY: `role` defaults to "user" and is only ever set to "admin" by
 * the controlled seed script (src/seeds/createAdmin.js). No controller in
 * this codebase should ever assign `req.body.role` directly to a user
 * document — Phase 3's user-creation/update controllers must whitelist
 * fields explicitly and ignore any client-supplied `role`.
 *
 * `collectionId` and `emergencyMessage` are included now so this schema
 * doesn't need to be rewritten when the Collections module (Phase 3) and
 * emergency-message editing (Phase 3) land — no business logic for either
 * is implemented in this phase.
 */
const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    mobileNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true, // allows many documents with no email while still enforcing uniqueness when present
      default: undefined,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never returned by default queries
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.USER,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      required: true,
    },
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'Collection',
      default: null,
    },
    emergencyMessage: {
      type: String,
      trim: true,
      default: null, // null means "use the global default template"
    },
    /**
     * Soft-delete marker (Phase 3). The document is NEVER physically
     * removed by admin "delete" — set instead of deleting so any future
     * historical SOS records that reference this user's _id remain valid
     * and traceable. A deleted user is also always set to `inactive`
     * status, so the existing `status` check in auth/authenticate already
     * blocks login for deleted accounts; this field is what distinguishes
     * "deactivated, can be reactivated" from "deleted".
     */
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ collectionId: 1 });
userSchema.index({ status: 1 });
userSchema.index({ deletedAt: 1 });

/**
 * Hashes and sets the password. This is the ONLY way passwordHash should
 * be set — never assign req.body.password (or a hash) to the field directly.
 */
userSchema.methods.setPassword = async function setPassword(plainPassword) {
  this.passwordHash = await hashPassword(plainPassword);
};

/**
 * Compares a plaintext password against this user's stored hash.
 * Requires passwordHash to have been selected on the query
 * (e.g. `.select('+passwordHash')`), since it's excluded by default.
 */
userSchema.methods.comparePassword = function comparePasswordMethod(plainPassword) {
  return comparePassword(plainPassword, this.passwordHash);
};

const User = mongoose.model('User', userSchema);

module.exports = User;
