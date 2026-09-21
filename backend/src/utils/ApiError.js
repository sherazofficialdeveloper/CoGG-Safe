/**
 * Represents a known, "operational" error — something we deliberately
 * threw because of a bad request, auth failure, etc. Distinguished from
 * unexpected programmer errors so the centralized error handler can
 * decide what's safe to expose to the client.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode - HTTP status code to send.
   * @param {string} message - Safe, user-facing message.
   * @param {object} [details] - Optional extra data (e.g. validation errors).
   */
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message) {
    return new ApiError(409, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}

module.exports = ApiError;
