const User = require('./user.model');
const Collection = require('../collections/collection.model');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../constants/roles');
const { USER_STATUS } = require('../../constants/sosConstants');
const { parsePagination, buildPaginationMeta } = require('../../utils/paginate');
const escapeRegex = require('../../utils/escapeRegex');

// Every read in this module excludes soft-deleted users by default —
// a deleted user should behave as gone from all admin management views,
// while still physically existing so future SOS records can reference it.
const NOT_DELETED = { deletedAt: null };

async function assertCollectionExists(collectionId) {
  const exists = await Collection.exists({ _id: collectionId });
  if (!exists) {
    throw ApiError.badRequest('collectionId does not reference an existing collection');
  }
}

/**
 * Creates a user inside a Collection.
 *
 * SECURITY: this function has no `role` parameter at all — there is no
 * code path through which a caller, even with a fully-trusted req.body,
 * can make this create anything other than ROLES.USER. The only place
 * ROLES.ADMIN is ever assigned is src/seeds/createAdmin.js.
 */
async function createUser({ username, mobileNumber, password, email, collectionId }) {
  await assertCollectionExists(collectionId);

  const user = new User({
    username,
    mobileNumber,
    email: email || undefined,
    collectionId,
    role: ROLES.USER, // hard-coded, never derived from caller input
  });
  await user.setPassword(password);
  await user.save();
  return user;
}

async function listUsers(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...NOT_DELETED };

  if (query.status) filter.status = query.status;
  if (query.collectionId) filter.collectionId = query.collectionId;
  if (query.search) {
    const regex = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ username: regex }, { mobileNumber: regex }];
  }

  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return { items, meta: buildPaginationMeta({ page, limit, total }) };
}

async function listContacts(userId) {
  const currentUser = await User.findOne({_id: userId, ...NOT_DELETED}).select('collectionId');
  if (!currentUser?.collectionId) return [];

  return User.find({
    ...NOT_DELETED,
    collectionId: currentUser.collectionId,
    role: ROLES.USER,
    _id: {$ne: userId},
  }).sort({username: 1});
}

async function getUserById(id) {
  const user = await User.findOne({ _id: id, ...NOT_DELETED });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

/**
 * Edits ONLY username / mobileNumber / email — the exact set of fields
 * the Admin Edit User form is allowed to change (per spec section 3/10).
 * role, status, password, and collectionId are not accepted here; each
 * has its own dedicated function/endpoint below.
 *
 * Email removal: passing `email: null` or `email: ''` clears it back to
 * "not configured" (field omitted, per the sparse-unique schema design).
 */
async function updateUser(id, { username, mobileNumber, email, emergencyMessage }) {
  const user = await getUserById(id);

  if (username !== undefined) user.username = username;
  if (mobileNumber !== undefined) user.mobileNumber = mobileNumber;
  if (email !== undefined) {
    user.email = email === null || email === '' ? undefined : email;
  }
  if (emergencyMessage !== undefined) user.emergencyMessage = emergencyMessage || null;

  await user.save();
  return user;
}

async function updateOwnProfile(id, updates) {
  return updateUser(id, updates);
}

async function setPassword(id, newPassword) {
  const user = await getUserById(id);
  await user.setPassword(newPassword);
  await user.save();
  return user;
}

async function setStatus(id, status) {
  const user = await getUserById(id);
  user.status = status;
  await user.save();
  return user;
}

function activateUser(id) {
  return setStatus(id, USER_STATUS.ACTIVE);
}

function deactivateUser(id) {
  return setStatus(id, USER_STATUS.INACTIVE);
}

/**
 * Soft-deletes a user (see user.model.js `deletedAt`). The document is
 * never physically removed — a hard delete would orphan any historical
 * SOS record's `userId` reference (added in a later phase) and lose the
 * ability to show who an old emergency belonged to. Deletion also forces
 * status to "inactive" so the account can never authenticate again,
 * consistent with an already-deactivated account.
 *
 * Because getUserById (used by every other function in this module)
 * excludes deletedAt != null, a soft-deleted user is automatically and
 * permanently excluded from all further admin management operations —
 * it cannot be fetched, edited, reactivated, or deleted again through
 * this API.
 */
async function deleteUser(id) {
  const user = await getUserById(id);
  await User.deleteOne({ _id: user._id });
  return null;
}

module.exports = {
  createUser,
  listUsers,
  listContacts,
  getUserById,
  updateUser,
  updateOwnProfile,
  setPassword,
  activateUser,
  deactivateUser,
  deleteUser,
};
