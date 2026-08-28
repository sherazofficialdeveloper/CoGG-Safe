const { body } = require('express-validator');
const { PLATFORMS } = require('./pushToken.model');

const registerTokenValidation = [
  body('token').trim().notEmpty().withMessage('token is required').isLength({ max: 4096 }),
  body('platform')
    .trim()
    .notEmpty()
    .withMessage('platform is required')
    .isIn(Object.values(PLATFORMS))
    .withMessage(`platform must be one of: ${Object.values(PLATFORMS).join(', ')}`),
];

const removeTokenValidation = [body('token').trim().notEmpty().withMessage('token is required')];

module.exports = { registerTokenValidation, removeTokenValidation };
