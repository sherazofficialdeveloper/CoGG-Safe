const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/**
 * General-purpose API rate limiter. Stricter limiters (e.g. for login)
 * can be composed on top of this per-route if needed later.
 */
const apiLimiter = rateLimit({
  // The in-memory integration suite intentionally makes hundreds of
  // requests from one Supertest address. Disabling only this transport
  // guard in NODE_ENV=test keeps production rate limiting intact and
  // prevents unrelated later tests from receiving a 429.
  skip: () => env.nodeEnv === 'test',
  windowMs: env.rateLimit.windowMinutes * 60 * 1000,
  max: env.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    error: {},
  },
});

/**
 * Tighter limiter for authentication endpoints to slow down
 * credential-stuffing / brute-force attempts.
 */
const authLimiter = rateLimit({
  skip: () => env.nodeEnv === 'test',
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    error: {},
  },
});

module.exports = { apiLimiter, authLimiter };
