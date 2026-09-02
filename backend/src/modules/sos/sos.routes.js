const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validateRequest = require('../../middlewares/validateRequest');
const { ROLES } = require('../../constants/roles');
const {
  sosIdParamValidation,
  createSosValidation,
  listSosValidation,
  reportLocationValidation,
  mediaComponentParamValidation,
  reportMediaValidation,
  reportServiceValidation,
  liveLocationPingValidation,
  getLiveLocationValidation,
} = require('./sos.validation');
const sosController = require('./sos.controller');
const { uploadSingleFile } = require('./media.upload.middleware');

const router = express.Router();

// Every route here requires a valid, active, database-backed identity.
// Role-specific restrictions (owner-only vs owner-or-admin vs admin-only)
// are then enforced per-route below and, authoritatively, in sos.service.
router.use(authenticate);

router.post('/', createSosValidation, validateRequest, sosController.createSos);
router.get('/', listSosValidation, validateRequest, sosController.listSos);
router.post('/:id/dispatch', sosIdParamValidation, validateRequest, sosController.dispatchSosAfterPersistence);
router.get('/:id', sosIdParamValidation, validateRequest, sosController.getSos);

router.patch('/:id/cancel', sosIdParamValidation, validateRequest, sosController.cancelSos);
// Deactivation is exclusively an Admin action.
router.patch('/:id/deactivate', authorize(ROLES.ADMIN), sosIdParamValidation, validateRequest, sosController.deactivateSos);
router.delete('/:id', authorize(ROLES.ADMIN), sosIdParamValidation, validateRequest, sosController.deleteSos);

router.post('/:id/location', reportLocationValidation, validateRequest, sosController.reportLocation);
router.patch('/:id/media/:component', reportMediaValidation, validateRequest, sosController.reportMedia);
router.patch('/:id/service/:component', reportServiceValidation, validateRequest, sosController.reportServiceResult);
// Actual binary upload — multer parses the multipart body first, then
// validation runs on the (now-populated) req.params, then the controller.
router.patch(
  '/:id/media/:component/upload',
  mediaComponentParamValidation,
  validateRequest,
  uploadSingleFile,
  sosController.uploadMedia
);
router.get(
  '/:id/media/:component/file',
  mediaComponentParamValidation,
  validateRequest,
  sosController.getMediaFile
);

router.post('/:id/live-location/start', sosIdParamValidation, validateRequest, sosController.startLiveLocation);
router.post('/:id/live-location/ping', liveLocationPingValidation, validateRequest, sosController.pingLiveLocation);
router.post('/:id/live-location/stop', sosIdParamValidation, validateRequest, sosController.stopLiveLocation);
router.get('/:id/live-location', getLiveLocationValidation, validateRequest, sosController.getLiveLocation);

module.exports = router;
