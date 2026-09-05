const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

mongoose.set('strictQuery', true);

async function connectDB() {
  try {
    await mongoose.connect(env.mongoUri);
    const sosCollectionExists = await mongoose.connection.db
      .listCollections({name: 'sos'}, {nameOnly: true})
      .hasNext();
    if (sosCollectionExists) {
      const sosCollection = mongoose.connection.db.collection('sos');
      const existingIndexes = await sosCollection.listIndexes().toArray();
      if (existingIndexes.some(index => index.name === 'one_open_sos_per_user')) {
        await sosCollection.dropIndex('one_open_sos_per_user');
        logger.info('Removed legacy one-open-SOS index');
      }
    }
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
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
