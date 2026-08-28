const { body, param, query } = require('express-validator');
const { SOS_STATUS, COMPONENT_STATUS, MEDIA_COMPONENT_NAMES, COMPONENT_NAMES } = require('../../constants/sosConstants');
const paginationValidation = require('../../utils/paginationValidation');

const sosIdParamValidation = [param('id').isMongoId().withMessage('Invalid SOS id')];

const createSosValidation = [
  body('idempotencyKey')
    .optional()
    .trim()
    .isLength({ min: 8, max: 128 })
    .withMessage('idempotencyKey must be between 8 and 128 characters'),
  body('location').optional().isObject().withMessage('location must be an object'),
  body('location.latitude')
    .if(body('location').exists())
    .isFloat({ min: -90, max: 90 })
    .withMessage('location.latitude must be between -90 and 90'),
  body('location.longitude')
    .if(body('location').exists())
    .isFloat({ min: -180, max: 180 })
    .withMessage('location.longitude must be between -180 and 180'),
];

const listSosValidation = [
  ...paginationValidation,
  query('status').optional().isIn(Object.values(SOS_STATUS)).withMessage(`status must be one of: ${Object.values(SOS_STATUS).join(', ')}`),
  query('collectionId').optional().isMongoId().withMessage('Invalid collectionId'),
  query('userId').optional().isMongoId().withMessage('Invalid userId'),
];

const reportLocationValidation = [
  ...sosIdParamValidation,
  body('status')
    .optional()
    .isIn([COMPONENT_STATUS.SUCCESS, COMPONENT_STATUS.FAILED])
    .withMessage(`status must be one of: ${COMPONENT_STATUS.SUCCESS}, ${COMPONENT_STATUS.FAILED}`),
  body('latitude')
    .if(body('status').not().equals(COMPONENT_STATUS.FAILED))
    .isFloat({ min: -90, max: 90 })
    .withMessage('latitude must be between -90 and 90'),
  body('longitude')
    .if(body('status').not().equals(COMPONENT_STATUS.FAILED))
    .isFloat({ min: -180, max: 180 })
    .withMessage('longitude must be between -180 and 180'),
  body('error')
    .if(body('status').equals(COMPONENT_STATUS.FAILED))
    .notEmpty()
    .withMessage('error is required when status is failed')
    .isLength({ max: 500 }),
];

const mediaComponentParamValidation = [
  ...sosIdParamValidation,
  param('component')
    .isIn(MEDIA_COMPONENT_NAMES)
    .withMessage(`component must be one of: ${MEDIA_COMPONENT_NAMES.join(', ')}`),
];

const reportMediaValidation = [
  ...mediaComponentParamValidation,
  body('status')
    .notEmpty()
    .isIn([COMPONENT_STATUS.SUCCESS, COMPONENT_STATUS.FAILED])
    .withMessage(`status must be one of: ${COMPONENT_STATUS.SUCCESS}, ${COMPONENT_STATUS.FAILED}`),
  body('storageRef')
    .if(body('status').equals(COMPONENT_STATUS.SUCCESS))
    .notEmpty()
    .withMessage('storageRef is required when status is success')
    .trim(),
  body('error')
    .if(body('status').equals(COMPONENT_STATUS.FAILED))
    .notEmpty()
    .withMessage('error is required when status is failed')
    .isLength({ max: 500 }),
];

const reportServiceValidation = [
  ...sosIdParamValidation,
  param('component')
    .isIn([COMPONENT_NAMES.SMS, COMPONENT_NAMES.EMAIL, COMPONENT_NAMES.PUSH, COMPONENT_NAMES.CALL, COMPONENT_NAMES.BACKEND])
    .withMessage('component must be a dispatch or backend component'),
  body('status')
    .notEmpty()
    .isIn(Object.values(COMPONENT_STATUS))
    .withMessage(`status must be one of: ${Object.values(COMPONENT_STATUS).join(', ')}`),
  body('error').optional().isLength({max: 500}),
];

const liveLocationPingValidation = [
  ...sosIdParamValidation,
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('latitude must be between -90 and 90'),
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('longitude must be between -180 and 180'),
  body('capturedAt').optional().isISO8601().withMessage('capturedAt must be a valid ISO8601 timestamp'),
];

const getLiveLocationValidation = [...sosIdParamValidation, ...paginationValidation];

module.exports = {
  sosIdParamValidation,
  createSosValidation,
  listSosValidation,
  reportLocationValidation,
  mediaComponentParamValidation,
  reportMediaValidation,
  reportServiceValidation,
  liveLocationPingValidation,
  getLiveLocationValidation,
};
