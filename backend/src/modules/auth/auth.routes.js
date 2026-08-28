const express = require('express');
const { authLimiter } = require('../../middlewares/rateLimiter');
const validateRequest = require('../../middlewares/validateRequest');
const authenticate = require('../../middlewares/authenticate');
const { loginValidation } = require('./auth.validation');
const authController = require('./auth.controller');

const router = express.Router();

// POST /api/auth/login — username OR email + password. Stricter rate limit
// than the general API to slow down credential-stuffing attempts.
router.post('/login', authLimiter, loginValidation, validateRequest, authController.login);

// GET /api/auth/me — returns the authenticated user's identity as read
// fresh from the database by the `authenticate` middleware.
router.get('/me', authenticate, authController.getMe);

module.exports = router;
