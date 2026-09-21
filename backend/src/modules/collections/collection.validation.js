const { body, param, query } = require('express-validator');
const { COLLECTION_TYPES } = require('../../constants/sosConstants');
const paginationValidation = require('../../utils/paginationValidation');

const ALLOWED_TYPES = Object.values(COLLECTION_TYPES);
const PHONE_REGEX = /^\+?[0-9\s()-]+$/;

const createCollectionValidation = [
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Collection type is required')
    .isIn(ALLOWED_TYPES)
    .withMessage(`Collection type must be one of: ${ALLOWED_TYPES.join(', ')}`),
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Collection name must be between 2 and 100 characters'),
  body('emergencyCallNumber')
    .trim()
    .notEmpty()
    .withMessage('Emergency call number is required')
    .matches(PHONE_REGEX)
    .withMessage('Emergency call number must be a valid phone number'),
  // The "name is required when type is other" business rule needs the
  // resolved value, not just syntax, so it's enforced in collection.service
  // (same place for both create and update — single source of truth).
];

const collectionIdParamValidation = [param('id').isMongoId().withMessage('Invalid collection id')];

const updateCollectionValidation = [
  ...collectionIdParamValidation,
  body('type')
    .optional()
    .trim()
    .isIn(ALLOWED_TYPES)
    .withMessage(`Collection type must be one of: ${ALLOWED_TYPES.join(', ')}`),
  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Collection name must be between 2 and 100 characters'),
  body('emergencyCallNumber')
    .optional()
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('Emergency call number must be a valid phone number'),
];

const listCollectionsValidation = [
  ...paginationValidation,
  query('type').optional().isIn(ALLOWED_TYPES).withMessage(`type must be one of: ${ALLOWED_TYPES.join(', ')}`),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('search must be at most 100 characters'),
];

const listCollectionUsersValidation = [...collectionIdParamValidation, ...paginationValidation];

module.exports = {
  createCollectionValidation,
  updateCollectionValidation,
  collectionIdParamValidation,
  listCollectionsValidation,
  listCollectionUsersValidation,
};
