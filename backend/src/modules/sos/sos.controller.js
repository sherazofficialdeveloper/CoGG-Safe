const sosService = require('./sos.service');
const { buildEmergencyLink } = require('./emergencyLink.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const ApiError = require('../../utils/ApiError');
const httpStatus = require('../../constants/httpStatus');

/**
 * Attaches the shareable emergency link to a response payload. The raw
 * emergencyToken is stripped by the model's toJSON — this is the one
 * place authorized callers (the SOS's own owner, or an admin) get the
 * ready-to-use link instead.
 */
function withEmergencyLink(sos) {
  const json = sos.toJSON ? sos.toJSON() : sos;
  return { ...json, emergencyLink: buildEmergencyLink(sos.emergencyToken) };
}

/**
 * POST /api/sos
 * userId is NEVER read from the body — it comes only from req.user,
 * set by the `authenticate` middleware from the verified token.
 */
const createSos = asyncHandler(async (req, res) => {
  const { idempotencyKey, location } = req.body;
  console.log('[SOS_DEBUG] CREATE_RECEIVED', { userId: req.user.id });
  const { sos, alreadyExisted } = await sosService.createSos({ userId: req.user.id, idempotencyKey, location });
  console.log('[SOS_DEBUG] CREATE_RESULT', { sosId: String(sos._id), alreadyExisted });

  ApiResponse.send(res, {
    statusCode: alreadyExisted ? httpStatus.OK : httpStatus.CREATED,
    message: alreadyExisted ? 'SOS already exists for this idempotency key' : 'SOS created',
    data: { sos: withEmergencyLink(sos) },
  });
  console.log('[SOS_DEBUG] RESPONSE_SENT', { sosId: String(sos._id) });
});

const dispatchSosAfterPersistence = asyncHandler(async (req, res) => {
  const sos = await sosService.dispatchSosAfterPersistence(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS dispatch started', data: { sos } });
});

const listSos = asyncHandler(async (req, res) => {
  const { items, meta } = await sosService.listSos(req.query, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS records retrieved', data: { sos: items, meta } });
});

const getSos = asyncHandler(async (req, res) => {
  const sos = await sosService.getSosById(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS retrieved', data: { sos: withEmergencyLink(sos) } });
});

const cancelSos = asyncHandler(async (req, res) => {
  const sos = await sosService.cancelSos(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS cancelled', data: { sos } });
});

const deactivateSos = asyncHandler(async (req, res) => {
  const sos = await sosService.deactivateSos(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS deactivated', data: { sos } });
});

const deleteSos = asyncHandler(async (req, res) => {
  await sosService.deleteSos(req.params.id, req.user);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'SOS deleted', data: {}});
});

const reportLocation = asyncHandler(async (req, res) => {
  const { status, latitude, longitude, error } = req.body;
  const sos = await sosService.reportLocation(req.params.id, req.user, { status, latitude, longitude, error });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Location updated', data: { sos } });
});

const reportMedia = asyncHandler(async (req, res) => {
  const { status, storageRef, error } = req.body;
  const sos = await sosService.reportMedia(req.params.id, req.user, req.params.component, { status, storageRef, error });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Media status updated', data: { sos } });
});

const reportServiceResult = asyncHandler(async (req, res) => {
  const {status, error} = req.body;
  const sos = await sosService.reportServiceResult(req.params.id, req.user, req.params.component, {status, error});
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'SOS service result updated', data: {sos}});
});

/**
 * PATCH /api/sos/:id/media/:component/upload
 * Actual binary upload (multipart/form-data, field "file"), parsed by
 * media.upload.middleware BEFORE this handler runs. This handler itself
 * never touches raw bytes beyond handing req.file to the service —
 * storage and component-status recording both live in sos.service.
 */
const uploadMedia = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw ApiError.badRequest('No file uploaded — expected multipart field "file"');
  }
  const sos = await sosService.uploadMedia(req.params.id, req.user, req.params.component, req.file);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Media uploaded', data: { sos } });
});

/**
 * GET /api/sos/:id/media/:component/file
 * Streams the stored media file back to an authorized caller (owner or
 * admin) — the same authorization used for the rest of the SOS.
 */
const getMediaFile = asyncHandler(async (req, res) => {
  const { stream, mimeType } = await sosService.getMediaFileStream(req.params.id, req.user, req.params.component);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  
  // Handle both Node.js streams (local) and web streams (R2)
  if (stream && typeof stream.pipe === 'function') {
    // Node.js Readable stream (local storage)
    stream.on('error', () => res.status(httpStatus.INTERNAL_SERVER_ERROR).end());
    stream.pipe(res);
  } else if (stream && typeof stream[Symbol.asyncIterator] === 'function') {
    // AWS SDK ReadableStream (R2 storage)
    stream.on('error', () => res.status(httpStatus.INTERNAL_SERVER_ERROR).end());
    stream.pipe(res);
  } else {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).end();
  }
});

const startLiveLocation = asyncHandler(async (req, res) => {
  const sos = await sosService.startLiveLocation(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Live location started', data: { sos } });
});

const pingLiveLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude, capturedAt } = req.body;
  const ping = await sosService.pingLiveLocation(req.params.id, req.user, { latitude, longitude, capturedAt });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Location update recorded', data: { ping } });
});

const stopLiveLocation = asyncHandler(async (req, res) => {
  const sos = await sosService.stopLiveLocation(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Live location stopped', data: { sos } });
});

const getLiveLocation = asyncHandler(async (req, res) => {
  const result = await sosService.getLiveLocation(req.params.id, req.user, req.query);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Live location retrieved', data: result });
});

module.exports = {
  createSos,
  dispatchSosAfterPersistence,
  listSos,
  getSos,
  cancelSos,
  deactivateSos,
  deleteSos,
  reportLocation,
  reportMedia,
  reportServiceResult,
  uploadMedia,
  getMediaFile,
  startLiveLocation,
  pingLiveLocation,
  stopLiveLocation,
  getLiveLocation,
};
