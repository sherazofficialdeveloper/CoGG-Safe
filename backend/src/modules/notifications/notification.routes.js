const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const validateRequest = require('../../middlewares/validateRequest');
const { listNotificationsValidation, notificationIdParamValidation } = require('./notification.validation');
const notificationController = require('./notification.controller');

const router = express.Router();

router.use(authenticate);

// Always scoped to req.user — there is no "list all notifications"
// endpoint here; that view is served by the SOS admin listing instead.
router.get('/', listNotificationsValidation, validateRequest, notificationController.listMyNotifications);
router.patch('/:id/read', notificationIdParamValidation, validateRequest, notificationController.markRead);

module.exports = router;
