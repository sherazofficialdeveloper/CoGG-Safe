/**
 * Ensures every successful API response follows the same shape:
 * { success, message, data }
 */
class ApiResponse {
  static send(res, { statusCode = 200, message = 'Success', data = null } = {}) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }
}

module.exports = ApiResponse;
