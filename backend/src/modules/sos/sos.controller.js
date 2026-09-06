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
function withEmergencyLink(sos, req = null) {
  const json = sos.toJSON ? sos.toJSON() : sos;
  const emergencyLink = buildEmergencyLink(sos.emergencyToken);
  const host = req?.get?.('x-forwarded-host') || req?.get?.('host');
  const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req?.protocol || 'https';
  const apiOrigin = host ? `${protocol}://${host}` : '';
  const mediaBase = apiOrigin ? `${apiOrigin}/api/emergency/${sos.emergencyToken}/media` : null;
  return {
    ...json,
    emergencyLink,
    emergencyMediaUrls: mediaBase ? {
      frontImage: `${mediaBase}/frontImage`,
      backImage: `${mediaBase}/backImage`,
      audio: `${mediaBase}/audio`,
    } : null,
  };
}

/**
 * POST /api/sos
 * userId is NEVER read from the body — it comes only from req.user,
 * set by the `authenticate` middleware from the verified token.
 */
const createSos = asyncHandler(async (req, res) => {
  const { idempotencyKey, location } = req.body;
  console.log('[SOS_DEBUG] CREATE_RECEIVED', {
    timestamp: new Date().toISOString(),
    userId: req.user.id,
    idempotencyKey: idempotencyKey || null,
    requestId: req.id || req.headers['x-request-id'] || null,
  });
  const { sos, alreadyExisted } = await sosService.createSos({ userId: req.user.id, idempotencyKey, location });
  console.log('[SOS_DEBUG] CREATE_RESULT', {
    sosId: String(sos._id),
    status: sos.status,
    idempotencyKey: idempotencyKey || null,
    alreadyExisted,
  });

  ApiResponse.send(res, {
    statusCode: alreadyExisted ? httpStatus.OK : httpStatus.CREATED,
    message: alreadyExisted ? 'SOS already exists for this idempotency key' : 'SOS created',
    data: { sos: withEmergencyLink(sos, req) },
  });
  console.log('[SOS_DEBUG] RESPONSE_SENT', { sosId: String(sos._id) });
});

const dispatchSosAfterPersistence = asyncHandler(async (req, res) => {
  const sos = await sosService.dispatchSosAfterPersistence(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS dispatch started', data: { sos: withEmergencyLink(sos, req) } });
});

const listSos = asyncHandler(async (req, res) => {
  const { items, meta } = await sosService.listSos(req.query, req.user);
  // Same shape as getSos() — the list/card view and the detail view must
  // carry the same emergencyLink/emergencyMediaUrls so a card tapped open
  // has working media immediately, before the detail screen's own refetch
  // resolves (avoids a flash of "no image" while that request is in flight).
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS records retrieved', data: { sos: items.map(item => withEmergencyLink(item, req)), meta } });
});

const getSos = asyncHandler(async (req, res) => {
  const sos = await sosService.getSosById(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS retrieved', data: { sos: withEmergencyLink(sos, req) } });
});

const cancelSos = asyncHandler(async (req, res) => {
  const sos = await sosService.cancelSos(req.params.id, req.user);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS cancelled', data: { sos: withEmergencyLink(sos, req) } });
});

const deactivateSos = asyncHandler(async (req, res) => {
  const sos = await sosService.deactivateSos(req.params.id, req.user);
  // Kept consistent with getSos()/listSos(): without this, marking an SOS
  // "Resolved" on the admin detail screen replaced detailRecord with a
  // payload that had no emergencyMediaUrls, so the photos/audio the admin
  // was just viewing would disappear the moment they resolved the case.
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'SOS deactivated', data: { sos: withEmergencyLink(sos, req) } });
});

const deleteSos = asyncHandler(async (req, res) => {
  await sosService.deleteSos(req.params.id, req.user);
  ApiResponse.send(res, {statusCode: httpStatus.OK, message: 'SOS deleted', data: {}});
});

const reportLocation = asyncHandler(async (req, res) => {
  const { status, latitude, longitude, accuracy, capturedAt, source, providerTimestamp, error } = req.body;
  const sos = await sosService.reportLocation(req.params.id, req.user, {
    status, latitude, longitude, accuracy, capturedAt, source, providerTimestamp, error,
  });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Location updated', data: { sos: withEmergencyLink(sos, req) } });
});

const reportMedia = asyncHandler(async (req, res) => {
  const { status, storageRef, error } = req.body;
  const sos = await sosService.reportMedia(req.params.id, req.user, req.params.component, { status, storageRef, error });
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Media status updated', data: { sos: withEmergencyLink(sos, req) } });
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
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Media uploaded', data: { sos: withEmergencyLink(sos, req) } });
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
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Live location started', data: { sos: withEmergencyLink(sos, req) } });
});

const pingLiveLocation = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracy, capturedAt, source } = req.body;
  const ping = await sosService.pingLiveLocation(req.params.id, req.user, {
    latitude, longitude, accuracy, capturedAt, source,
  });
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
