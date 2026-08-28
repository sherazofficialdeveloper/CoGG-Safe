const { body, param, query } = require('express-validator');
const { USER_STATUS } = require('../../constants/sosConstants');
const paginationValidation = require('../../utils/paginationValidation');

const USERNAME_REGEX = /^[a-zA-Z0-9._-]+$/;
const PHONE_REGEX = /^\+?[0-9]{7,15}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * User creation. `role` is explicitly rejected here (not merely ignored)
 * so a malicious `{ "role": "admin" }` payload fails loudly with a 400
 * instead of silently succeeding as a "user" — this makes the protection
 * independently testable and impossible to miss during review.
 * The service layer (user.service.createUser) is a second, independent
 * safety net: it doesn't accept a role parameter at all.
 */
const createUserValidation = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(USERNAME_REGEX)
    .withMessage('Username may only contain letters, numbers, dots, underscores and hyphens'),
  body('mobileNumber')
    .trim()
    .notEmpty()
    .withMessage('Mobile number is required')
    .matches(PHONE_REGEX)
    .withMessage('Mobile number must be a valid phone number'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Email must be a valid email address')
    .normalizeEmail(),
  body('collectionId')
    .notEmpty()
    .withMessage('collectionId is required')
    .isMongoId()
    .withMessage('Invalid collectionId'),
  body('role').not().exists().withMessage('role cannot be set on user creation'),
];

const userIdParamValidation = [param('id').isMongoId().withMessage('Invalid user id')];

/**
 * General profile edit. Only username / mobileNumber / email are
 * accepted. role, status, password, and collectionId each have their own
 * dedicated endpoint and are explicitly rejected here rather than merely
 * ignored, so a client can't smuggle them through this route.
 */
const updateUserValidation = [
  ...userIdParamValidation,
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(USERNAME_REGEX)
    .withMessage('Username may only contain letters, numbers, dots, underscores and hyphens'),
  body('mobileNumber')
    .optional()
    .trim()
    .matches(PHONE_REGEX)
    .withMessage('Mobile number must be a valid phone number'),
  body('email')
    .optional({ nullable: true })
    .custom((value) => value === null || value === '' || EMAIL_REGEX.test(value))
    .withMessage('Email must be a valid email address, or null/empty to remove it'),
  body('role').not().exists().withMessage('role cannot be changed through this endpoint'),
  body('status')
    .not()
    .exists()
    .withMessage('status cannot be changed through this endpoint — use activate/deactivate'),
  body('password')
    .not()
    .exists()
    .withMessage('password cannot be changed through this endpoint — use the password endpoint'),
  body('collectionId').not().exists().withMessage('collectionId cannot be changed through this endpoint'),
];

const updateMyProfileValidation = [
  body('username').optional().trim().isLength({min: 3, max: 50}).matches(USERNAME_REGEX),
  body('mobileNumber').optional().trim().matches(PHONE_REGEX),
  body('email').optional({nullable: true}).custom(value => value === null || value === '' || EMAIL_REGEX.test(value)),
  body('emergencyMessage').optional({nullable: true}).isString().trim().isLength({max: 500}),
  body('role').not().exists(),
  body('status').not().exists(),
  body('password').not().exists(),
  body('collectionId').not().exists(),
];

const setPasswordValidation = [
  ...userIdParamValidation,
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

const listUsersValidation = [
  ...paginationValidation,
  query('status')
    .optional()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`status must be one of: ${Object.values(USER_STATUS).join(', ')}`),
  query('collectionId').optional().isMongoId().withMessage('Invalid collectionId'),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('search must be at most 100 characters'),
];

module.exports = {
  createUserValidation,
  updateUserValidation,
  setPasswordValidation,
  userIdParamValidation,
  listUsersValidation,
  updateMyProfileValidation,
};
