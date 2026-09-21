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

let counter = 0;
async function createUserAndLogin(role) {
  counter += 1;
  const user = new User({
    username: `${role}${counter}`,
    mobileNumber: `0300${String(3000000 + counter)}`,
    role,
  });
  await user.setPassword('Passw0rd!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd!' });

  return { user, token: loginRes.body.data.token };
}

async function createCollection(overrides = {}) {
  return Collection.create({
    type: 'family',
    name: 'Test Family',
    emergencyCallNumber: '15',
    ...overrides,
  });
}

describe('POST /api/users', () => {
  test('admin can create a user inside a collection', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'newmember',
        mobileNumber: '03001112222',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.data.user.username).toBe('newmember');
    expect(res.body.data.user.role).toBe('user');
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({identifier: 'newmember', password: 'StrongPass1', role: ROLES.USER});
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.user.role).toBe(ROLES.USER);
  });

  test('normal user cannot create a user', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const collection = await createCollection();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'shouldfail',
        mobileNumber: '03001112223',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });

    expect(res.status).toBe(403);
    const exists = await User.findOne({ username: 'shouldfail' });
    expect(exists).toBeNull();
  });

  test('unauthenticated request cannot create a user', async () => {
    const collection = await createCollection();
    const res = await request(app)
      .post('/api/users')
      .send({
        username: 'shouldalsofail',
        mobileNumber: '03001112224',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });
    expect(res.status).toBe(401);
  });

  test('a created user always has role=user even without any role field sent', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'plainmember',
        mobileNumber: '03001112225',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });

    expect(res.status).toBe(201);
    const dbUser = await User.findOne({ username: 'plainmember' });
    expect(dbUser.role).toBe('user');
  });

  test('{ role: "admin" } in the request body is rejected and no admin is created', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'spoofattempt',
        mobileNumber: '03001112226',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
        role: 'admin', // malicious attempt
      });

    expect(res.status).toBe(400); // rejected outright by validation
    const dbUser = await User.findOne({ username: 'spoofattempt' });
    expect(dbUser).toBeNull(); // nothing was created at all
  });

  test('rejects user creation with a non-existent collectionId', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const fakeCollectionId = '64b7f9f9f9f9f9f9f9f9f9f9';

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'nocollection',
        mobileNumber: '03001112227',
        password: 'StrongPass1',
        collectionId: fakeCollectionId,
      });

    expect(res.status).toBe(400);
  });

  test('rejects a duplicate username', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'dupeuser',
        mobileNumber: '03001112228',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'dupeuser',
        mobileNumber: '03001112229',
        password: 'StrongPass1',
        collectionId: collection._id.toString(),
      });

    expect(res.status).toBe(409);
  });

  test('rejects a weak/short password', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();

    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: 'weakpassuser',
        mobileNumber: '03001112230',
        password: '123',
        collectionId: collection._id.toString(),
      });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/users and /api/users/:id', () => {
  test('admin can list users and view a single user (edit-form fields)', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = new User({
      username: 'vieweduser',
      mobileNumber: '03005556666',
      collectionId: collection._id,
    });
    await member.setPassword('Passw0rd!');
    await member.save();

    const listRes = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.users.some((u) => u.username === 'vieweduser')).toBe(true);

    const detailRes = await request(app)
      .get(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.user.username).toBe('vieweduser');
    expect(detailRes.body.data.user.mobileNumber).toBe('03005556666');
    expect(detailRes.body.data.user.email).toBeUndefined(); // missing email stays absent, never a placeholder
    expect(detailRes.body.data.user.passwordHash).toBeUndefined();
  });

  test('normal user cannot list or view users', async () => {
    const { token, user } = await createUserAndLogin(ROLES.USER);

    const listRes = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(403);

    const detailRes = await request(app).get(`/api/users/${user._id}`).set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(403);
  });
});

describe('PATCH /api/users/:id (profile edit)', () => {
  async function createManagedUser(collection) {
    const user = new User({
      username: 'editableuser',
      mobileNumber: '03007778888',
      collectionId: collection._id,
    });
    await user.setPassword('Passw0rd!');
    await user.save();
    return user;
  }

  test('admin can update username', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = await createManagedUser(collection);

    const res = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'renameduser' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('renameduser');
  });

  test('admin can update mobile number', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = await createManagedUser(collection);

    const res = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mobileNumber: '03009998888' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.mobileNumber).toBe('03009998888');
  });

  test('admin can add, then change, then remove email', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = await createManagedUser(collection);

    const addRes = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'member@example.com' });
    expect(addRes.status).toBe(200);
    expect(addRes.body.data.user.email).toBe('member@example.com');

    const changeRes = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'newaddress@example.com' });
    expect(changeRes.status).toBe(200);
    expect(changeRes.body.data.user.email).toBe('newaddress@example.com');

    const removeRes = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ email: null });
    expect(removeRes.status).toBe(200);
    expect(removeRes.body.data.user.email).toBeUndefined();
  });

  test('role, status, password, and collectionId cannot be changed through this endpoint', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = await createManagedUser(collection);

    const res = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin', status: 'inactive', password: 'NewPassword1', collectionId: collection._id.toString() });

    expect(res.status).toBe(400);
    const dbUser = await User.findById(member._id);
    expect(dbUser.role).toBe('user');
  });

  test('normal user cannot edit any user', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const collection = await createCollection();
    const member = await createManagedUser(collection);

    const res = await request(app)
      .patch(`/api/users/${member._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'hijacked' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/password', () => {
  test('admin can reset a user password, and it is never returned', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = new User({ username: 'pwuser', mobileNumber: '03004445555', collectionId: collection._id });
    await member.setPassword('OldPassword1');
    await member.save();

    const res = await request(app)
      .patch(`/api/users/${member._id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'BrandNewPassword1' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
    expect(JSON.stringify(res.body)).not.toMatch(/BrandNewPassword1/);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'pwuser', password: 'BrandNewPassword1' });
    expect(loginRes.status).toBe(200);
  });

  test('normal user cannot reset another user password', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const collection = await createCollection();
    const member = new User({ username: 'pwuser2', mobileNumber: '03004445556', collectionId: collection._id });
    await member.setPassword('OldPassword1');
    await member.save();

    const res = await request(app)
      .patch(`/api/users/${member._id}/password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'ShouldNotWork1' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/:id/activate and /deactivate', () => {
  test('admin can deactivate a user, blocking their login, then reactivate them', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = new User({ username: 'togglestatus', mobileNumber: '03004445557', collectionId: collection._id });
    await member.setPassword('Passw0rd!');
    await member.save();

    const deactivateRes = await request(app)
      .patch(`/api/users/${member._id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.data.user.status).toBe('inactive');

    const blockedLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'togglestatus', password: 'Passw0rd!' });
    expect(blockedLogin.status).toBe(403);

    const activateRes = await request(app)
      .patch(`/api/users/${member._id}/activate`)
      .set('Authorization', `Bearer ${token}`);
    expect(activateRes.status).toBe(200);
    expect(activateRes.body.data.user.status).toBe('active');

    const allowedLogin = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'togglestatus', password: 'Passw0rd!' });
    expect(allowedLogin.status).toBe(200);
  });

  test('normal user cannot activate/deactivate users', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const collection = await createCollection();
    const member = new User({ username: 'protectedstatus', mobileNumber: '03004445558', collectionId: collection._id });
    await member.setPassword('Passw0rd!');
    await member.save();

    const res = await request(app)
      .patch(`/api/users/${member._id}/deactivate`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/users/:id (hard delete)', () => {
  test('admin permanently deletes a user', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = new User({ username: 'todelete', mobileNumber: '03004445559', collectionId: collection._id });
    await member.setPassword('Passw0rd!');
    await member.save();

    const res = await request(app).delete(`/api/users/${member._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const rawDoc = await User.collection.findOne({ _id: member._id });
    expect(rawDoc).toBeNull();
  });

  test('a deleted user disappears from admin list/detail views and cannot log in', async () => {
    const { token } = await createUserAndLogin(ROLES.ADMIN);
    const collection = await createCollection();
    const member = new User({ username: 'deletedgone', mobileNumber: '03004445560', collectionId: collection._id });
    await member.setPassword('Passw0rd!');
    await member.save();

    await request(app).delete(`/api/users/${member._id}`).set('Authorization', `Bearer ${token}`);

    const detailRes = await request(app).get(`/api/users/${member._id}`).set('Authorization', `Bearer ${token}`);
    expect(detailRes.status).toBe(404);

    const listRes = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);
    expect(listRes.body.data.users.some((u) => u.username === 'deletedgone')).toBe(false);

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'deletedgone', password: 'Passw0rd!' });
    expect(loginRes.status).toBe(401);
  });

  test('normal user cannot delete a user', async () => {
    const { token } = await createUserAndLogin(ROLES.USER);
    const collection = await createCollection();
    const member = new User({ username: 'notdeletable', mobileNumber: '03004445561', collectionId: collection._id });
    await member.setPassword('Passw0rd!');
    await member.save();

    const res = await request(app).delete(`/api/users/${member._id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);

    const stillThere = await User.findById(member._id);
    expect(stillThere).not.toBeNull();
    expect(stillThere.deletedAt).toBeNull();
  });
});

describe('GET /api/contacts', () => {
  test('returns only same-collection users excluding the current user and hides sensitive fields', async () => {
    const collectionA = await createCollection({ name: 'Alpha Group' });
    const collectionB = await createCollection({ name: 'Beta Group' });

    const currentUser = new User({
      username: 'owneruser',
      mobileNumber: '03008881111',
      email: 'owner@example.com',
      collectionId: collectionA._id,
      role: ROLES.USER,
    });
    await currentUser.setPassword('Passw0rd!');
    await currentUser.save();

    const sameCollectionUser = new User({
      username: 'samecollectionuser',
      mobileNumber: '03008881112',
      email: 'same@example.com',
      collectionId: collectionA._id,
      role: ROLES.USER,
    });
    await sameCollectionUser.setPassword('Passw0rd!');
    await sameCollectionUser.save();

    const otherCollectionUser = new User({
      username: 'othercollectionuser',
      mobileNumber: '03008881113',
      email: 'other@example.com',
      collectionId: collectionB._id,
      role: ROLES.USER,
    });
    await otherCollectionUser.setPassword('Passw0rd!');
    await otherCollectionUser.save();

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ identifier: 'owneruser', password: 'Passw0rd!' });

    expect(loginRes.status).toBe(200);

    const res = await request(app)
      .get('/api/contacts')
      .set('Authorization', `Bearer ${loginRes.body.data.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.contacts).toHaveLength(1);
    expect(res.body.data.contacts[0]._id.toString()).toBe(sameCollectionUser._id.toString());
    expect(res.body.data.contacts[0].username).toBe('samecollectionuser');
    expect(res.body.data.contacts[0].mobileNumber).toBe('03008881112');
    expect(res.body.data.contacts[0].email).toBe('same@example.com');
    expect(res.body.data.contacts[0].passwordHash).toBeUndefined();
    expect(res.body.data.contacts.some(c => c._id.toString() === currentUser._id.toString())).toBe(false);
    expect(res.body.data.contacts.some(c => c._id.toString() === otherCollectionUser._id.toString())).toBe(false);
  });
});
