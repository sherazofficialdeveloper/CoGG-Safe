const ApiError = require('./ApiError');
const { ROLES } = require('../constants/roles');

function isAdmin(user) {
  return !!user && user.role === ROLES.ADMIN;
}

/**
 * Throws 403 unless the authenticated user IS the resource owner OR is an
 * admin. Used everywhere a resource (SOS, live location, notification, ...)
 * belongs to a specific user but admins retain full visibility/control.
 *
 * @param {string} ownerId - the resource's owning user id (string form)
 * @param {{id: string, role: string}} reqUser - req.user, set by `authenticate`
 */
function assertOwnerOrAdmin(ownerId, reqUser, message = 'You do not have permission to access this resource') {
  if (isAdmin(reqUser)) return;
  if (String(ownerId) === String(reqUser.id)) return;
  throw ApiError.forbidden(message);
}

module.exports = { isAdmin, assertOwnerOrAdmin };
