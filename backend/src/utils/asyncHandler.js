/**
 * Wraps an async Express handler so thrown/rejected errors are passed to
 * next(err) automatically, instead of every controller needing its own
 * try/catch. This is what keeps error handling centralized.
 *
 * Usage: router.get('/', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
