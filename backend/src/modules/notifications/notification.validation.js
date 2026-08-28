const { param, query } = require('express-validator');
const paginationValidation = require('../../utils/paginationValidation');

const listNotificationsValidation = [
  ...paginationValidation,
  query('onlyActive').optional().isBoolean().withMessage('onlyActive must be true or false'),
];

const notificationIdParamValidation = [param('id').isMongoId().withMessage('Invalid notification id')];

module.exports = { listNotificationsValidation, notificationIdParamValidation };
