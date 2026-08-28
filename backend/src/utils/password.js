const bcrypt = require('bcryptjs');
const env = require('../config/env');

/**
 * Hashes a plaintext password. This is the ONLY place bcrypt.hash should
 * be called from — the User model and auth service both go through here
 * so the hashing algorithm/cost can be changed in one place.
 */
async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.bcryptSaltRounds);
}

/**
 * Compares a plaintext password against a stored bcrypt hash.
 */
async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

module.exports = { hashPassword, comparePassword };
