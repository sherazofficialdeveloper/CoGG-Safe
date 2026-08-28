const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const User = require('../modules/users/user.model');
const Collection = require('../modules/collections/collection.model');
const { USER_STATUS } = require('../constants/sosConstants');

/**
 * Verifies the Bearer token, then loads the user fresh from the database
 * for every request.
 *
 * SECURITY: req.user.role (and .status) always come from the database
 * record looked up here — NOT from the JWT payload's role claim. This
 * means:
 *   - A token can never grant access based on a stale or forged role claim;
 *     the current DB role always wins.
 *   - A user deactivated after their token was issued is rejected
 *     immediately on their next request, not just at their next login.
 *
 * Downstream middleware/controllers must only use req.user for
 * authorization decisions — never req.body.role, req.query.role, or
 * anything else client-supplied.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('Authentication token missing');
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (err) {
      throw ApiError.unauthorized('Invalid or expired authentication token');
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw ApiError.forbidden('This account is inactive. Contact your administrator.');
    }

    const collection = user.collectionId
      ? await Collection.findById(user.collectionId).select('name type')
      : null;

    req.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      username: user.username,
      mobileNumber: user.mobileNumber,
      email: user.email,
      role: user.role, // fresh from DB, authoritative
      status: user.status,
      collectionId: user.collectionId,
      emergencyMessage: user.emergencyMessage,
      collection,
    };

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
