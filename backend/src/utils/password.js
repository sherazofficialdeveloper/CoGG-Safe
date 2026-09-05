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


/**
 * Encrypts a plaintext user password only so an authenticated administrator
 * can recover credentials for copy/share workflows across devices. The
 * login password is still verified ONLY against passwordHash.
 */
function encryptCredentialPassword(plainPassword) {
  const crypto = require('crypto');
  const env = require('../config/env');
  const key = crypto.createHash('sha256').update(String(env.credentialEncryptionKey)).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainPassword), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptCredentialPassword(payload) {
  const crypto = require('crypto');
  const env = require('../config/env');
  if (!payload || typeof payload !== 'string') throw new Error('Stored credential password is unavailable.');
  const parts = payload.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Stored credential password format is invalid.');
  const key = crypto.createHash('sha256').update(String(env.credentialEncryptionKey)).digest();
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  const encrypted = Buffer.from(parts[3], 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports.encryptCredentialPassword = encryptCredentialPassword;
module.exports.decryptCredentialPassword = decryptCredentialPassword;
