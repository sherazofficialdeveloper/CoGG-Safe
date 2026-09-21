/**
 * Manual, controlled admin creation script.
 *
 * This is intentionally NOT an HTTP endpoint. Per the role-security
 * requirement, the first Admin account must be created only through a
 * deliberate operator action (running this script against the target
 * database), never through any client-facing API.
 *
 * Usage:
 *   ADMIN_SEED_USERNAME=admin \
 *   ADMIN_SEED_PASSWORD='a-strong-password' \
 *   ADMIN_SEED_MOBILE='03001234567' \
 *   ADMIN_SEED_EMAIL='admin@example.com' \
 *   npm run seed:admin
 *
 * ADMIN_SEED_EMAIL is optional. Re-running this script safely verifies and
 * updates the controlled development admin without storing plaintext passwords.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const env = require('../config/env');
const logger = require('../config/logger');
const User = require('../modules/users/user.model');
const { ROLES } = require('../constants/roles');

async function run() {
  const username = process.env.ADMIN_SEED_USERNAME;
  const password = process.env.ADMIN_SEED_PASSWORD;
  const mobileNumber = process.env.ADMIN_SEED_MOBILE;
  const email = process.env.ADMIN_SEED_EMAIL || undefined;

  if (!username || !password || !mobileNumber) {
    logger.error(
      'ADMIN_SEED_USERNAME, ADMIN_SEED_PASSWORD, and ADMIN_SEED_MOBILE must all be set to run this script'
    );
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(env.mongoUri);

  try {
    const existing = await User.findOne({
      $or: [
        { username },
        ...(email ? [{ email: email.toLowerCase() }] : []),
      ],
    }).select('+passwordHash');
    if (existing) {
      existing.username = username;
      existing.mobileNumber = mobileNumber;
      existing.email = email;
      existing.role = ROLES.ADMIN;
      existing.status = 'active';
      existing.collectionId = null;
      existing.emergencyMessage = null;
      existing.deletedAt = null;
      await existing.setPassword(password);
      await existing.save();
      logger.info(`Admin account "${username}" verified and updated.`);
      return;
    }

    const admin = new User({
      username,
      mobileNumber,
      email,
      role: ROLES.ADMIN, // the only line in this codebase that sets ROLES.ADMIN
      collectionId: null,
      emergencyMessage: null,
      deletedAt: null,
    });
    await admin.setPassword(password);
    await admin.save();

    logger.info(`Admin account "${username}" created successfully.`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  logger.error('Admin seed script failed', { error: err.message });
  process.exitCode = 1;
});
