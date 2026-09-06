const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

async function dropLegacyOpenSosIndex() {
  // Older deployments created this index before multiple SOS events were
  // allowed per user. Drop it once during boot; the schema no longer creates
  // it, so this is safe and makes existing production databases converge to
  // the current lifecycle without requiring a manual Mongo shell operation.
  try {
    const indexes = await mongoose.connection.db.collection('sos').indexes();
    const legacy = indexes.find(index => index.name === 'one_open_sos_per_user');
    if (legacy) {
      await mongoose.connection.db.collection('sos').dropIndex('one_open_sos_per_user');
      logger.warn('Dropped legacy one_open_sos_per_user index; multiple SOS events per user are now allowed.');
    }
  } catch (err) {
    // Collection may not exist yet on a brand-new database; Mongoose creates
    // it when the first SOS is written. Never block server startup here.
    logger.warn('Could not reconcile legacy SOS index during startup', {error: err.message});
  }
}

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    await dropLegacyOpenSosIndex();
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err.message });
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', { error: err.message });
  });
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
