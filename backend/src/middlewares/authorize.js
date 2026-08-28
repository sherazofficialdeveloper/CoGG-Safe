const ApiError = require('../utils/ApiError');

/**
 * Restricts a route to specific roles. Must run after `authenticate`,
 * since it relies entirely on req.user.role (which authenticate populates
 * from the database). This middleware never inspects req.body, req.query,
 * or any other client-controlled input for role information.
 *
 * Usage: router.get('/admin/x', authenticate, authorize(ROLES.ADMIN), handler)
 */
function authorize(...allowedRoles) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }

    next();
  };
}

module.exports = authorize;
