process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const { ROLES } = require('../src/constants/roles');
const { USER_STATUS } = require('../src/constants/sosConstants');

beforeAll(async () => {
  await dbHandler.connect();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

async function createUser(overrides = {}) {
  const user = new User({
    username: overrides.username || 'sherazali',
    mobileNumber: overrides.mobileNumber || '03001234567',
    email: overrides.email === undefined ? 'sheraz@example.com' : overrides.email,
    role: overrides.role || ROLES.USER,
    status: overrides.status || USER_STATUS.ACTIVE,
  });
  await user.setPassword(overrides.password || 'Passw0rd!');
  await user.save();
  return user;
}

describe('POST /api/auth/login', () => {
  test('logs in successfully with username + password', async () => {
    await createUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sherazali', password: 'Passw0rd!', role: ROLES.USER });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.username).toBe('sherazali');
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  test('logs in successfully with email + password', async () => {
    await createUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sheraz@example.com', password: 'Passw0rd!', role: ROLES.USER });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.token).toBe('string');
  });

  test('logs in successfully when the selected role matches the account role', async () => {
    await createUser({ username: 'adminuser', role: ROLES.ADMIN, email: 'admin@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'adminuser', password: 'Passw0rd!', role: ROLES.ADMIN });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe(ROLES.ADMIN);
  });

  test('rejects wrong password with a generic message', async () => {
    await createUser();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sherazali', password: 'WrongPassword', role: ROLES.USER });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('rejects a normal user selecting the admin sign-in mode', async () => {
    await createUser({ username: 'userrole', role: ROLES.USER, email: 'userrole@example.com' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'userrole', password: 'Passw0rd!', role: ROLES.ADMIN });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/selected sign-in mode/i);
  });

  test('rejects unknown identifier with the SAME generic message as wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'no-such-user', password: 'whatever', role: ROLES.USER });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  test('rejects login for an inactive account (correct password)', async () => {
    await createUser({ status: USER_STATUS.INACTIVE });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sherazali', password: 'Passw0rd!', role: ROLES.USER });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/inactive/i);
  });

  test('rejects a request missing identifier/password with a validation error', async () => {
    const res = await request(app).post('/api/auth/login').send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  test('rejects a password shorter than the minimum length', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sherazali', password: 'short', role: ROLES.USER });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({message: 'Password must be at least 8 characters'}),
      ]),
    );
  });

  test('rejects a role spoofing attempt instead of issuing a token', async () => {
    await createUser({ username: 'plainuser', role: ROLES.USER });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'plainuser', password: 'Passw0rd!', role: 'admin' }); // spoof attempt

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/selected sign-in mode/i);
  });
});

describe('GET /api/auth/me', () => {
  test('returns the authenticated user collection relationship and default message data', async () => {
    const collection = await Collection.create({type: 'family', name: 'Family', emergencyCallNumber: '15'});
    const user = await createUser({username: 'familymember', mobileNumber: '03001112222'});
    user.collectionId = collection._id;
    await user.save();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({identifier: user.username, password: 'Passw0rd!', role: ROLES.USER});

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.collectionId).toBe(collection._id.toString());
    expect(res.body.data.collection.name).toBe('Family');
    expect(res.body.data.user.emergencyMessage).toBeNull();
  });

  test('returns the current user when authenticated', async () => {
    const user = await createUser();
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'sherazali', password: 'Passw0rd!', role: ROLES.USER });
    const { token } = loginRes.body.data;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.id).toBe(user._id.toString());
    expect(res.body.data.user.role).toBe('user');
  });

  test('rejects a request with no Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a request with a malformed/invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer this.is.not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  test('rejects a previously-valid token once the account is deactivated', async () => {
    const user = await createUser({ username: 'todeactivate' });
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'todeactivate', password: 'Passw0rd!', role: ROLES.USER });
    const { token } = loginRes.body.data;

    user.status = USER_STATUS.INACTIVE;
    await user.save();

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('rejects an expired token', async () => {
    const user = await createUser();
    const token = jwt.sign({ sub: user._id.toString(), role: user.role }, process.env.JWT_SECRET, {
      expiresIn: -1,
    });

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });
});
