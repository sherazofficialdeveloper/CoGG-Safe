const express = require('express');
const { param } = require('express-validator');
const validateRequest = require('../../middlewares/validateRequest');
const { MEDIA_COMPONENT_NAMES } = require('../../constants/sosConstants');
const emergencyLinkController = require('./emergencyLink.controller');

const router = express.Router();

const tokenParamValidation = [
  param('token')
    .trim()
    .notEmpty()
    .isLength({ min: 16, max: 128 })
    .withMessage('Invalid emergency reference'),
];

const mediaParamValidation = [
  ...tokenParamValidation,
  param('component')
    .isIn(MEDIA_COMPONENT_NAMES)
    .withMessage(`component must be one of: ${MEDIA_COMPONENT_NAMES.join(', ')}`),
];

// No authenticate/authorize here by design — see emergencyLink.controller.js.
router.get('/:token', tokenParamValidation, validateRequest, emergencyLinkController.getEmergencyView);
router.get('/:token/media/:component', mediaParamValidation, validateRequest, emergencyLinkController.getEmergencyMedia);

module.exports = router;
