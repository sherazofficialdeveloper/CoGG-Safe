const { getPublicEmergencyView, getPublicMediaStream } = require('./emergencyLink.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

/**
 * GET /api/emergency/:token
 * Deliberately NOT behind `authenticate` — this is the public link
 * shared during an emergency. Authorization here is the token itself
 * (see emergencyLink.service for what it does and doesn't expose).
 */
const getEmergencyView = asyncHandler(async (req, res) => {
  const view = await getPublicEmergencyView(req.params.token);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Emergency information', data: view });
});

/**
 * GET /api/emergency/:token/media/:component
 * Public, token-gated media retrieval — same "ACTIVE only" rule as the
 * main emergency view, re-checked independently on every request (not
 * cached), so a deactivation takes effect immediately.
 */
const getEmergencyMedia = asyncHandler(async (req, res) => {
  const { stream, mimeType } = await getPublicMediaStream(req.params.token, req.params.component);
  res.setHeader('Content-Type', mimeType);
  stream.on('error', () => res.status(httpStatus.INTERNAL_SERVER_ERROR).end());
  stream.pipe(res);
});

module.exports = { getEmergencyView, getEmergencyMedia };
