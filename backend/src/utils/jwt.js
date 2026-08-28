const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Signs a JWT. Callers control the payload, but by convention the codebase
 * always includes { sub: userId, role }. NOTE: the role claim inside the
 * token is a convenience only — it must never be trusted for authorization
 * decisions. `authenticate` middleware re-reads the role from the database
 * on every request specifically so a token's role claim can't be relied on.
 */
function generateToken(payload) {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

/**
 * Verifies a JWT's signature and expiry. Throws (JsonWebTokenError /
 * TokenExpiredError) on failure — callers should catch and translate.
 */
function verifyToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

module.exports = { generateToken, verifyToken };
