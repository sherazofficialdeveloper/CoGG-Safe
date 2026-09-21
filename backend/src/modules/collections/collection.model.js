const mongoose = require('mongoose');

const { Schema } = mongoose;
const { COLLECTION_TYPES } = require('../../constants/sosConstants');

/**
 * Core Collection entity (Family / Workers / Other).
 *
 * DESIGN DECISION: a Collection does NOT store an embedded array of its
 * users. Membership is a one-to-many relationship already expressed by
 * `User.collectionId` (see user.model.js), so storing it again here would
 * duplicate data that could drift out of sync. Anyone needing "users in
 * this collection" queries `User.find({ collectionId })` — see
 * user.service.listUsers, reused by collection.controller.listCollectionUsers.
 */
const collectionSchema = new Schema(
  {
    type: {
      type: String,
      enum: Object.values(COLLECTION_TYPES),
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    emergencyCallNumber: {
      type: String,
      required: true,
      trim: true,
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

collectionSchema.index({ type: 1 });
collectionSchema.index({ name: 1 });

const Collection = mongoose.model('Collection', collectionSchema);

module.exports = Collection;
