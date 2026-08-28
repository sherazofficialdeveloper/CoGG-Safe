process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';

const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const { ROLES } = require('../src/constants/roles');

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
async function createUserAndLogin(role) {
  userCounter += 1;
  const user = new User({
    username: `${role}${userCounter}`,
    mobileNumber: `0300${String(2000000 + userCounter)}`,
    role,
  });
  await user.setPassword('Passw0rd!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd!' });

  return { user, token: loginRes.body.data.token };
}

describe('POST /api/collections', () => {
  test('admin can create a collection', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'family', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.collection.type).toBe('family');
    expect(res.body.data.collection.name).toBe('Family'); // auto-derived default
  });

  test('normal user cannot create a collection', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'family', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(403);
  });

  test('unauthenticated request is rejected', async () => {
    const res = await request(app)
      .post('/api/collections')
      .send({ type: 'family', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(401);
  });

  test('type=other requires a custom name', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'other', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/custom collection name/i);
  });

  test('type=other with a custom name succeeds', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'other', name: 'Neighborhood Watch', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(201);
    expect(res.body.data.collection.name).toBe('Neighborhood Watch');
  });

  test('rejects an invalid collection type', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'not-a-real-type', emergencyCallNumber: '+923001234567' });

    expect(res.status).toBe(400);
  });

  test('rejects a missing emergency call number', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);

    const res = await request(app)
      .post('/api/collections')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'family' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/collections and /api/collections/:id', () => {
  test('admin can list and view collection details', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const created = await Collection.create({ type: 'workers', name: 'Workers', emergencyCallNumber: '15' });

    const listRes = await request(app).get('/api/collections').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.collections.length).toBe(1);
    expect(listRes.body.data.meta.total).toBe(1);

    const detailRes = await request(app)
      .get(`/api/collections/${created._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.collection.name).toBe('Workers');
  });

  test('returns 404 for a non-existent collection id', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const fakeId = '64b7f9f9f9f9f9f9f9f9f9f9';

    const res = await request(app).get(`/api/collections/${fakeId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('normal user cannot list collections', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const res = await request(app).get('/api/collections').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/collections/:id', () => {
  test('admin can edit collection name and emergency call number', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const created = await Collection.create({ type: 'family', name: 'Family', emergencyCallNumber: '15' });

    const res = await request(app)
      .patch(`/api/collections/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'School Group A', emergencyCallNumber: '999' });

    expect(res.status).toBe(200);
    expect(res.body.data.collection.name).toBe('Family');
    expect(res.body.data.collection.emergencyCallNumber).toBe('999');
  });

  test('switching an existing collection to type=other without any name keeps the current name', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const created = await Collection.create({ type: 'family', name: 'Family', emergencyCallNumber: '15' });

    const res = await request(app)
      .patch(`/api/collections/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'other' });

    expect(res.status).toBe(200);
    expect(res.body.data.collection.type).toBe('other');
    expect(res.body.data.collection.name).toBe('Family');
  });

  test('switching to type=other while explicitly clearing the name fails', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const created = await Collection.create({ type: 'family', name: 'Family', emergencyCallNumber: '15' });

    const res = await request(app)
      .patch(`/api/collections/${created._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'other', name: '' });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/collections/:id/users', () => {
  test('lists only users belonging to that collection', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collectionA = await Collection.create({ type: 'family', name: 'Family A', emergencyCallNumber: '15' });
    const collectionB = await Collection.create({ type: 'family', name: 'Family B', emergencyCallNumber: '15' });

    const memberA = new User({ username: 'membera', mobileNumber: '03009990001', collectionId: collectionA._id });
    await memberA.setPassword('Passw0rd!');
    await memberA.save();

    const memberB = new User({ username: 'memberb', mobileNumber: '03009990002', collectionId: collectionB._id });
    await memberB.setPassword('Passw0rd!');
    await memberB.save();

    const res = await request(app)
      .get(`/api/collections/${collectionA._id}/users`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBe(1);
    expect(res.body.data.users[0].username).toBe('membera');
  });
});
