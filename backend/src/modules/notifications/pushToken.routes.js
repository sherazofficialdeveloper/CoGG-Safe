const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const validateRequest = require('../../middlewares/validateRequest');
const { registerTokenValidation, removeTokenValidation } = require('./pushToken.validation');
const pushTokenController = require('./pushToken.controller');

const router = express.Router();

router.use(authenticate);

router.post('/', registerTokenValidation, validateRequest, pushTokenController.registerToken);
router.delete('/', removeTokenValidation, validateRequest, pushTokenController.removeToken);

module.exports = router;
