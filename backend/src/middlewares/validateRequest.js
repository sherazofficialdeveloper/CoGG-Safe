const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after an array of express-validator checks in a route definition.
 * Every route that accepts input should end its validator chain with this,
 * so validation failures are reported consistently — no route should
 * hand-roll its own validation-error response.
 *
 * Usage:
 *   router.post('/', [body('username').notEmpty(), ...], validateRequest, controller.create)
 */
function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  const details = errors.array().map((e) => ({
    field: e.path,
    message: e.msg,
  }));

  next(ApiError.badRequest('Validation failed', details));
}

module.exports = validateRequest;
