process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';

const express = require('express');
const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const authenticate = require('../src/middlewares/authenticate');
const authorize = require('../src/middlewares/authorize');
const errorHandler = require('../src/middlewares/errorHandler');
const User = require('../src/modules/users/user.model');
const { generateToken } = require('../src/utils/jwt');
const { ROLES } = require('../src/constants/roles');

/**
 * A minimal standalone app exercising the real authenticate/authorize
 * middleware against two protected routes. This is deliberately NOT part
 * of the production route tree — Admin API modules are Phase 3+ — but it
 * proves the middleware itself behaves correctly, which is what those
 * future routes will rely on.
 */
function buildTestApp() {
  const app = express();
  app.use(express.json());

  app.get('/protected/admin-only', authenticate, authorize(ROLES.ADMIN), (req, res) => {
    res.status(200).json({ success: true, message: 'welcome admin', data: null });
  });

  app.get('/protected/any-authenticated', authenticate, (req, res) => {
    res.status(200).json({ success: true, message: 'welcome', data: { role: req.user.role } });
  });

  app.use(errorHandler);
  return app;
}

const app = buildTestApp();

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

let userCounter = 0;
async function createUser(role) {
  userCounter += 1;
  const user = new User({
    username: `${role}user${userCounter}`,
    mobileNumber: `0300${String(1000000 + userCounter)}`,
    role,
  });
  await user.setPassword('Passw0rd!');
  await user.save();
  return user;
}

describe('authenticate + authorize middleware', () => {
  test('allows access when the user role matches the required role', async () => {
    const admin = await createUser(ROLES.ADMIN);
    const token = generateToken({ sub: admin._id.toString(), role: admin.role });

    const res = await request(app).get('/protected/admin-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('denies a normal user hitting an admin-only route', async () => {
    const user = await createUser(ROLES.USER);
    const token = generateToken({ sub: user._id.toString(), role: user.role });

    const res = await request(app).get('/protected/admin-only').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  test('a forged token claiming role=admin is still denied, because role is re-read from the database', async () => {
    const user = await createUser(ROLES.USER); // actual DB role is "user"
    // Simulate an attacker who somehow crafted/signed a token with an
    // admin role claim (e.g. a worst-case secret leak). Even so, the
    // token's role claim must never be trusted directly.
    const spoofedToken = generateToken({ sub: user._id.toString(), role: ROLES.ADMIN });

    const res = await request(app)
      .get('/protected/admin-only')
      .set('Authorization', `Bearer ${spoofedToken}`);

    expect(res.status).toBe(403);
  });

  test('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/protected/any-authenticated');
    expect(res.status).toBe(401);
  });

  test('rejects a request with a token for a user that no longer exists', async () => {
    const user = await createUser(ROLES.USER);
    const token = generateToken({ sub: user._id.toString(), role: user.role });
    await User.deleteOne({ _id: user._id });

    const res = await request(app)
      .get('/protected/any-authenticated')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
