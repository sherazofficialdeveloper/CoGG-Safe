const authService = require('./auth.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

/**
 * POST /api/auth/login
 * Body: { identifier, password, role? }
 * When supplied, role selects the requested portal; the service compares it
 * with the database-authoritative account role before issuing a token.
 */
const login = asyncHandler(async (req, res) => {
  const { identifier, password, role: selectedRole } = req.body;
  const { token, user, collection } = await authService.login(identifier, password, selectedRole);

  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Login successful',
    data: { token, user, collection },
  });
});

/**
 * GET /api/auth/me
 * Requires authentication. Returns the identity `authenticate` middleware
 * attached to req.user, sourced fresh from the database.
 */
const getMe = asyncHandler(async (req, res) => {
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Current authenticated user',
    data: { user: req.user, collection: req.user.collection },
  });
});

module.exports = { login, getMe };
