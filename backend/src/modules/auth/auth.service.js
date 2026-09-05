const User = require('../users/user.model');
const Collection = require('../collections/collection.model');
const ApiError = require('../../utils/ApiError');
const { generateToken } = require('../../utils/jwt');
const { USER_STATUS } = require('../../constants/sosConstants');

/**
 * Authenticates a user by username OR email + password.
 *
 * `selectedRole` is the requested portal, not an authorization claim. The database role is authoritative.
 *
 * Ordering is deliberate for security:
 *   1. Look up the user (by username or email).
 *   2. Verify the password.
 *   3. Check account status.
 *   4. Compare the requested portal with the actual database role.
 *   5. Issue a token with the actual database role.
 *
 * This means a caller without a valid password never learns whether an account
 * exists or whether it's active/inactive — both cases return the same generic
 * "Invalid credentials" error.
 */
async function login(identifier, plainPassword, selectedRole) {
  const normalizedIdentifier = identifier.trim();
  const emailIdentifier = normalizedIdentifier.toLowerCase();

  const user = await User.findOne({
    $or: [{ username: normalizedIdentifier }, { email: emailIdentifier }],
  }).select('+passwordHash');

  if (!user) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  const isPasswordValid = await user.comparePassword(plainPassword);
  if (!isPasswordValid) {
    throw ApiError.unauthorized('Invalid credentials');
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden('This account is inactive. Contact your administrator.');
  }

  if (selectedRole && user.role !== selectedRole) {
    throw ApiError.forbidden('This account is not authorized for the selected sign-in mode.');
  }

  const token = generateToken({
    sub: user._id.toString(),
    role: user.role, // sourced from the DB record, never from the request
  });

  const collection = user.collectionId
    ? await Collection.findById(user.collectionId).select('name type emergencyCallNumber')
    : null;

  return { token, user, collection };
}

module.exports = { login };
