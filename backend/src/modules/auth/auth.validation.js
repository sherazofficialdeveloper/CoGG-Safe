const { body } = require('express-validator');
const { ALL_ROLES } = require('../../constants/roles');

/**
 * Validates the login payload only. The role is a portal selection and is
 * checked against the database-authoritative role by the auth service.
 */
const loginValidation = [
  body('identifier')
    .trim()
    .notEmpty()
    .withMessage('Username or email is required')
    .isLength({ max: 254 })
    .withMessage('Username or email is too long'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('role')
    .optional()
    .isIn(ALL_ROLES)
    .withMessage('Select a valid sign-in mode'),
];

module.exports = { loginValidation };
