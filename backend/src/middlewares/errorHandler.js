const env = require('../config/env');
const logger = require('../config/logger');
const ApiError = require('../utils/ApiError');

/**
 * Converts known error types (Mongoose, JWT, etc.) into ApiError so the
 * response shape stays consistent regardless of where the error came from.
 */
function normalizeError(err) {
  if (err instanceof ApiError) return err;

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => e.message);
    return ApiError.badRequest('Validation failed', details);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    return ApiError.conflict(`${field} already exists`);
  }

  // Mongoose invalid ObjectId
  if (err.name === 'CastError') {
    return ApiError.badRequest(`Invalid value for ${err.path}`);
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid authentication token');
  }
  if (err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Authentication token expired');
  }

  // Multer (file upload) errors — e.g. file too large, too many files.
  // err.field/err.code are Multer's own diagnostic fields; only a safe,
  // generic message derived from err.code is ever sent to the client.
  if (err.name === 'MulterError') {
    const messages = {
      LIMIT_FILE_SIZE: 'Uploaded file exceeds the maximum allowed size',
      LIMIT_FILE_COUNT: 'Too many files uploaded',
      LIMIT_UNEXPECTED_FILE: 'Unexpected file field in upload',
    };
    return ApiError.badRequest(messages[err.code] || 'File upload failed');
  }

  // Unknown/programmer error — never leak details to the client.
  return ApiError.internal('Something went wrong');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const apiError = normalizeError(err);
  const isServerError = apiError.statusCode >= 500;

  logger.error(err.message, {
    statusCode: apiError.statusCode,
    path: req.originalUrl,
    method: req.method,
    userId: req.user ? req.user.id : undefined,
    stack: err.stack,
  });

  const responseBody = {
    success: false,
    message: apiError.message,
    error: {
      ...(apiError.details ? { details: apiError.details } : {}),
      // Stack traces and internal details never go to the client,
      // even in development, to keep behavior predictable.
      ...(env.nodeEnv === 'development' && !isServerError ? {} : {}),
    },
  };

  res.status(apiError.statusCode).json(responseBody);
}

module.exports = errorHandler;
