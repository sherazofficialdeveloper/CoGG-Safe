const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

async function connect() {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
}

/**
 * Disconnects from the current in-memory server WITHOUT stopping it,
 * then reconnects to that same instance — used by tests that need to
 * simulate "the DB connection is briefly down" (e.g. a readiness-check
 * test). Deliberately does NOT create a new MongoMemoryServer (unlike
 * connect()), so it can't leak a second server process.
 */
async function disconnect() {
  await mongoose.disconnect();
}

async function reconnect() {
  if (!mongoServer) {
    throw new Error('reconnect() called before connect()');
  }
  await mongoose.connect(mongoServer.getUri());
}

async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((collection) => collection.deleteMany({}))
  );
}

module.exports = { connect, closeDatabase, clearDatabase, disconnect, reconnect };
