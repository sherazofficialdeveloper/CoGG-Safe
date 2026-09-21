process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';
process.env.SOS_CANCELLATION_WINDOW_SECONDS = '1';
process.env.SCHEDULER_POLL_INTERVAL_MS = '150';

const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const schedulerService = require('../src/modules/scheduler/scheduler.service');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const Sos = require('../src/modules/sos/sos.model');
const PushToken = require('../src/modules/notifications/pushToken.model');
const { ROLES } = require('../src/constants/roles');
const { COMPONENT_STATUS } = require('../src/constants/sosConstants');

const ACTIVATION_WAIT_MS = 1600;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  await dbHandler.connect();
  schedulerService.start();
});

afterEach(async () => {
  await dbHandler.clearDatabase();
});

afterAll(async () => {
  schedulerService.stop();
  await dbHandler.closeDatabase();
});

let counter = 0;
async function createUserAndLogin(opts) {
  opts = opts || {};
  const role = opts.role || ROLES.USER;
  const collectionId = opts.collectionId || null;
  counter += 1;
  const user = new User({
    username: role + counter,
    mobileNumber: '0300' + String(6000000 + counter),
    role: role,
    collectionId: collectionId,
  });
  await user.setPassword('Passw0rd!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd!' });

  return { user: user, token: loginRes.body.data.token };
}

describe('POST /api/push-tokens (registration)', () => {
  test('an authenticated user can register a device token', async () => {
    const ctx = await createUserAndLogin();

    const res = await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'device-token-abc123', platform: 'android' });

    expect(res.status).toBe(200);
    const stored = await PushToken.findOne({ token: 'device-token-abc123' });
    expect(String(stored.userId)).toBe(ctx.user._id.toString());
    expect(stored.platform).toBe('android');
  });

  test('unauthenticated request cannot register a device token', async () => {
    const res = await request(app).post('/api/push-tokens').send({ token: 'x', platform: 'ios' });
    expect(res.status).toBe(401);
  });

  test('an invalid platform value is rejected', async () => {
    const ctx = await createUserAndLogin();
    const res = await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'device-token-xyz', platform: 'windows-phone' });
    expect(res.status).toBe(400);
  });

  test('a missing token value is rejected', async () => {
    const ctx = await createUserAndLogin();
    const res = await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ platform: 'ios' });
    expect(res.status).toBe(400);
  });

  test('a user can register multiple device tokens (multi-device support)', async () => {
    const ctx = await createUserAndLogin();

    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'device-1', platform: 'ios' });
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'device-2', platform: 'android' });

    const count = await PushToken.countDocuments({ userId: ctx.user._id });
    expect(count).toBe(2);
  });

  test('re-registering the same token refreshes lastSeenAt without creating a duplicate row', async () => {
    const ctx = await createUserAndLogin();
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'stable-device', platform: 'android' });
    const first = await PushToken.findOne({ token: 'stable-device' });

    await new Promise((r) => setTimeout(r, 10));
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'stable-device', platform: 'android' });

    const count = await PushToken.countDocuments({ token: 'stable-device' });
    expect(count).toBe(1);
    const second = await PushToken.findOne({ token: 'stable-device' });
    expect(second.lastSeenAt.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt.getTime());
  });

  test('re-registering the same token for a DIFFERENT user reassigns it (same-device upsert / logout+login-as-someone-else)', async () => {
    const ctxA = await createUserAndLogin();
    const ctxB = await createUserAndLogin();

    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctxA.token)
      .send({ token: 'shared-device', platform: 'ios' });

    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctxB.token)
      .send({ token: 'shared-device', platform: 'ios' });

    const stored = await PushToken.findOne({ token: 'shared-device' });
    expect(String(stored.userId)).toBe(ctxB.user._id.toString());
    expect(String(stored.userId)).not.toBe(ctxA.user._id.toString());

    const totalRows = await PushToken.countDocuments({ token: 'shared-device' });
    expect(totalRows).toBe(1); // reassigned in place, not duplicated
  });
});

describe('DELETE /api/push-tokens (logout handling)', () => {
  test('a user can remove their own device token', async () => {
    const ctx = await createUserAndLogin();
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'to-remove', platform: 'android' });

    const res = await request(app)
      .delete('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'to-remove' });

    expect(res.status).toBe(200);
    const stored = await PushToken.findOne({ token: 'to-remove' });
    expect(stored).toBeNull();
  });

  test('a user cannot remove another user\'s device token', async () => {
    const owner = await createUserAndLogin();
    const stranger = await createUserAndLogin();
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + owner.token)
      .send({ token: 'protected-device', platform: 'ios' });

    const res = await request(app)
      .delete('/api/push-tokens')
      .set('Authorization', 'Bearer ' + stranger.token)
      .send({ token: 'protected-device' });

    expect(res.status).toBe(403);
    const stillThere = await PushToken.findOne({ token: 'protected-device' });
    expect(stillThere).not.toBeNull();
  });

  test('removing a token that does not exist is a harmless no-op', async () => {
    const ctx = await createUserAndLogin();
    const res = await request(app)
      .delete('/api/push-tokens')
      .set('Authorization', 'Bearer ' + ctx.token)
      .send({ token: 'never-existed' });
    expect(res.status).toBe(200);
  });

  test('unauthenticated request cannot remove a device token', async () => {
    const res = await request(app).delete('/api/push-tokens').send({ token: 'anything' });
    expect(res.status).toBe(401);
  });
});

describe('Push dispatch targets the correct user\'s registered devices', () => {
  test('push component succeeds when a recipient has a registered device; notification tab entry exists regardless', async () => {
    const collection = await Collection.create({ type: 'family', name: 'Test', emergencyCallNumber: '15' });
    const creator = await createUserAndLogin({ collectionId: collection._id });
    const admin = await createUserAndLogin({ role: ROLES.ADMIN });

    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ token: 'admin-device', platform: 'android' });

    const created = await request(app).post('/api/sos').set('Authorization', 'Bearer ' + creator.token).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.SUCCESS);

    const notifRes = await request(app).get('/api/notifications').set('Authorization', 'Bearer ' + admin.token);
    expect(notifRes.body.data.notifications.length).toBeGreaterThan(0);
  });

  test('push component is marked failed (not skipped, not success) when recipients exist but none have a registered device — SOS itself is unaffected', async () => {
    const collection = await Collection.create({ type: 'family', name: 'Test2', emergencyCallNumber: '15' });
    const creator = await createUserAndLogin({ collectionId: collection._id });
    await createUserAndLogin({ role: ROLES.ADMIN }); // recipient exists, registers no device

    const created = await request(app).post('/api/sos').set('Authorization', 'Bearer ' + creator.token).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.status).toBe('active'); // SOS lifecycle entirely unaffected by push failure
  });

  test('a user with multiple devices can receive push attempts on all of them', async () => {
    const collection = await Collection.create({ type: 'family', name: 'Test3', emergencyCallNumber: '15' });
    const creator = await createUserAndLogin({ collectionId: collection._id });
    const admin = await createUserAndLogin({ role: ROLES.ADMIN });

    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ token: 'admin-phone', platform: 'ios' });
    await request(app)
      .post('/api/push-tokens')
      .set('Authorization', 'Bearer ' + admin.token)
      .send({ token: 'admin-tablet', platform: 'android' });

    const created = await request(app).post('/api/sos').set('Authorization', 'Bearer ' + creator.token).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.SUCCESS);
    const deviceCount = await PushToken.countDocuments({ userId: admin.user._id });
    expect(deviceCount).toBe(2);
  });

  test('two simultaneous SOS in the same collection produce isolated notifications, each referencing only its own SOS', async () => {
    const collection = await Collection.create({ type: 'family', name: 'Test4', emergencyCallNumber: '15' });
    const userA = await createUserAndLogin({ collectionId: collection._id });
    const userB = await createUserAndLogin({ collectionId: collection._id });
    const admin = await createUserAndLogin({ role: ROLES.ADMIN });

    const sosA = await request(app).post('/api/sos').set('Authorization', 'Bearer ' + userA.token).send({});
    const sosB = await request(app).post('/api/sos').set('Authorization', 'Bearer ' + userB.token).send({});
    await wait(ACTIVATION_WAIT_MS);

    const notifRes = await request(app).get('/api/notifications').set('Authorization', 'Bearer ' + admin.token);
    const sosIds = notifRes.body.data.notifications.map((n) => n.sosId && n.sosId._id);
    expect(sosIds).toContain(sosA.body.data.sos.id);
    expect(sosIds).toContain(sosB.body.data.sos.id);
    expect(sosA.body.data.sos.id).not.toBe(sosB.body.data.sos.id);
  });
});
