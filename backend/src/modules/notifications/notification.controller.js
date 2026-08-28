const notificationService = require('./notification.service');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const httpStatus = require('../../constants/httpStatus');

const listMyNotifications = asyncHandler(async (req, res) => {
  const { items, meta } = await notificationService.listForUser(req.user.id, req.query);
  ApiResponse.send(res, {
    statusCode: httpStatus.OK,
    message: 'Notifications retrieved',
    data: { notifications: items, meta },
  });
});

const markRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markRead(req.params.id, req.user.id);
  ApiResponse.send(res, { statusCode: httpStatus.OK, message: 'Notification marked as read', data: { notification } });
});

module.exports = { listMyNotifications, markRead };
