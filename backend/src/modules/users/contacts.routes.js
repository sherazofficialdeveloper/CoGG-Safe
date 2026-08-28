const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const userController = require('./user.controller');

const router = express.Router();

router.get('/', authenticate, userController.listMyContacts);

module.exports = router;