const pushTokenService = require('./pushToken.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

/** POST /api/push-tokens — register or refresh the caller's own device token. */
const registerToken = asyncHandler(async (req, res) => {
  const { token, platform } = req.body;
  await pushTokenService.registerToken(req.user.id, { token, platform });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Device token registered', data: null });
});

/** DELETE /api/push-tokens — unregister the caller's own device token (logout). */
const removeToken = asyncHandler(async (req, res) => {
  await pushTokenService.removeToken(req.user.id, req.body.token);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Device token removed', data: null });
});

module.exports = { registerToken, removeToken };
