process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';
// Short cancellation window + fast scheduler polling so the durable
// PENDING -> ACTIVE (+dispatch) job can be exercised in tests without
// real multi-second/multi-hour waits.
process.env.SOS_CANCELLATION_WINDOW_SECONDS = '1';
process.env.SCHEDULER_POLL_INTERVAL_MS = '150';

const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const schedulerService = require('../src/modules/scheduler/scheduler.service');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const Sos = require('../src/modules/sos/sos.model');
const ScheduledJob = require('../src/modules/scheduler/scheduledJob.model');
const Notification = require('../src/modules/notifications/notification.model');
const { ROLES } = require('../src/constants/roles');
const { SOS_STATUS, LIVE_LOCATION_STATUS, COMPONENT_STATUS } = require('../src/constants/sosConstants');

// Cancellation window (1000ms) + a couple of poll ticks (150ms each) + margin.
const ACTIVATION_WAIT_MS = 1600;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeAll(async () => {
  await dbHandler.connect();
  // The durable scheduler is only started here (and in server.js for the
  // real app) — never automatically on require — so tests must start it
  // explicitly, same as a real deployment starts it once after connecting.
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
async function createCollection() {
  return Collection.create({ type: 'family', name: 'Test Family', emergencyCallNumber: '15' });
}

async function createUserAndLogin({ role = ROLES.USER, collectionId = null, email } = {}) {
  counter += 1;
  const user = new User({
    username: `${role}${counter}`,
    mobileNumber: `0300${String(4000000 + counter)}`,
    role,
    collectionId,
    email,
  });
  await user.setPassword('Passw0rd!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd!' });

  return { user, token: loginRes.body.data.token };
}

describe('POST /api/sos (creation + ownership)', () => {
  test('authenticated user with a collection can create an SOS', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });

    const res = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});

    expect(res.status).toBe(201);
    expect(res.body.data.sos.status).toBe(SOS_STATUS.ACTIVE);
    expect(res.body.data.sos.userId).toBe(user._id.toString());
    expect(res.body.data.sos.collectionId).toBe(collection._id.toString());
    expect(typeof res.body.data.sos.emergencyLink).toBe('string');
    expect(res.body.data.sos.emergencyToken).toBeUndefined(); // raw token never exposed
  });

  test('unauthenticated request cannot create an SOS', async () => {
    const res = await request(app).post('/api/sos').send({});
    expect(res.status).toBe(401);
  });

  test('a deactivated (inactive) user cannot create an SOS', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    user.status = 'inactive';
    await user.save();

    const res = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(403);
  });

  test('userId cannot be spoofed via the request body — SOS always belongs to the authenticated user', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    const { user: otherUser } = await createUserAndLogin({ collectionId: collection._id });

    const res = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: otherUser._id.toString() });

    expect(res.status).toBe(201);
    expect(res.body.data.sos.userId).toBe(user._id.toString()); // not otherUser
  });

  test('emergency message defaults to the template with the username interpolated', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });

    const res = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    expect(res.body.data.sos.emergencyMessage).toBe(`I am ${user.username}. I may be in danger. Please help me.`);
  });

  test('emergency message uses the user custom saved message when set', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    user.emergencyMessage = 'Custom danger message';
    await user.save();

    const res = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    expect(res.body.data.sos.emergencyMessage).toBe('Custom danger message');
  });

  test('duplicate offline-sync retry with the same idempotencyKey returns the original SOS, not a new one', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const first = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: 'offline-key-123' });
    expect(first.status).toBe(201);

    const retry = await request(app)
      .post('/api/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({ idempotencyKey: 'offline-key-123' });
    expect(retry.status).toBe(200);
    expect(retry.body.data.sos.id).toBe(first.body.data.sos.id);

    const count = await Sos.countDocuments({});
    expect(count).toBe(1);
  });

  test('a second active SOS from the same user is rejected', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const first = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const second = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  test('direct-active creation does not create an SOS activation scheduler job', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').auth(token, {type: 'bearer'});

    expect(created.status).toBe(201);
    expect(await ScheduledJob.countDocuments({type: 'sos_activation'})).toBe(0);
  });

  test('an existing pending SOS is activated immediately when read after deployment', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    const legacy = await Sos.create({
      userId: user._id,
      collectionId: collection._id,
      emergencyMessage: 'Legacy pending SOS',
      emergencyToken: `legacy-${Date.now()}-${counter}`,
      status: SOS_STATUS.PENDING,
    });

    const res = await request(app)
      .get(`/api/sos/${legacy._id}`)
      .auth(token, {type: 'bearer'});

    expect(res.status).toBe(200);
    expect(res.body.data.sos.status).toBe(SOS_STATUS.ACTIVE);
    expect(res.body.data.sos.activatedAt).not.toBeNull();
  });
});

describe('GET /api/sos/:id and /api/sos (isolation between users)', () => {
  test('a user cannot access another user\'s SOS', async () => {
    const collection = await createCollection();
    const { token: ownerToken, user: owner } = await createUserAndLogin({ collectionId: collection._id });
    const { token: strangerToken } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${ownerToken}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
    void owner;
  });

  test('admin can access any SOS', async () => {
    const collection = await createCollection();
    const { token: ownerToken } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${ownerToken}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('multiple simultaneous SOS records remain isolated in listings', async () => {
    const collection = await createCollection();
    const { token: tokenA } = await createUserAndLogin({ collectionId: collection._id });
    const { token: tokenB } = await createUserAndLogin({ collectionId: collection._id });

    await request(app).post('/api/sos').set('Authorization', `Bearer ${tokenA}`).send({});
    await request(app).post('/api/sos').set('Authorization', `Bearer ${tokenB}`).send({});

    const listA = await request(app).get('/api/sos').set('Authorization', `Bearer ${tokenA}`);
    expect(listA.body.data.sos.length).toBe(1);

    const listB = await request(app).get('/api/sos').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.data.sos.length).toBe(1);

    expect(listA.body.data.sos[0].id).not.toBe(listB.body.data.sos[0].id);
  });

  test('a normal user cannot see another user\'s SOS by manipulating the userId query param', async () => {
    const collection = await createCollection();
    const { token: tokenA } = await createUserAndLogin({ collectionId: collection._id });
    const { token: tokenB, user: userB } = await createUserAndLogin({ collectionId: collection._id });

    await request(app).post('/api/sos').set('Authorization', `Bearer ${tokenB}`).send({});

    const res = await request(app)
      .get(`/api/sos?userId=${userB._id.toString()}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.data.sos.length).toBe(0); // still scoped to tokenA's own user, query param ignored
  });
});

describe('SOS cancellation', () => {
  test.skip('legacy pending cancellation is no longer part of the direct-active lifecycle', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const cancelRes = await request(app).patch(`/api/sos/${sosId}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.sos.status).toBe(SOS_STATUS.CANCELLED);

    const getRes = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.sos.status).toBe(SOS_STATUS.CANCELLED);
  });

  test.skip('legacy pending cancellation does not apply to newly created SOS records', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await request(app).patch(`/api/sos/${sosId}/cancel`).set('Authorization', `Bearer ${token}`);

    await wait(ACTIVATION_WAIT_MS); // let the activation timer fire, if it were going to

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.status).toBe(SOS_STATUS.CANCELLED); // never flipped to ACTIVE
    expect(sosDoc.components.sms.status).toBe(COMPONENT_STATUS.PENDING);
    expect(sosDoc.components.email.status).toBe(COMPONENT_STATUS.PENDING);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.PENDING);
    expect(sosDoc.components.call.status).toBe(COMPONENT_STATUS.PENDING);
  });

  test('cannot cancel someone else\'s SOS', async () => {
    const collection = await createCollection();
    const { token: ownerToken } = await createUserAndLogin({ collectionId: collection._id });
    const { token: strangerToken } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${ownerToken}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app).patch(`/api/sos/${sosId}/cancel`).set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  test('cannot cancel a directly active SOS', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app).patch(`/api/sos/${sosId}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe('SOS activation + dispatch (component failure isolation)', () => {
  test.skip('legacy activation dispatch setup failure is covered by the dispatch service tests', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    // Simulate the shared dispatch setup failing (User.findById returns
    // null) by removing the user out from under the SOS before the
    // activation window elapses. This is exactly the class of failure
    // that must not leave every dispatch component silently "pending".
    await User.deleteOne({ _id: user._id });

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.status).toBe(SOS_STATUS.ACTIVE); // activation itself still succeeds
    expect(sosDoc.components.sms.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.email.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.call.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.sms.error).toBeTruthy(); // a real, safe error message, not silence
  });

  test('SOS is ACTIVE immediately and dispatch runs each component independently', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    // Another active collection member so recipients exist for sms/push/notifications.
    await createUserAndLogin({ collectionId: collection._id, email: 'member@example.com' });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.status).toBe(SOS_STATUS.ACTIVE);
    expect(sosDoc.activatedAt).not.toBeNull();
    // Push has no registered device in this test environment, so its
    // delivery component may truthfully be failed without affecting SOS.
    expect(sosDoc.components.sms.status).not.toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.push.status).toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.call.status).not.toBe(COMPONENT_STATUS.FAILED);
    expect(sosDoc.components.email.status).not.toBe(COMPONENT_STATUS.FAILED);
    void user;
  });

  test('a failed front-camera component does not fail the SOS or block other components', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const failRes = await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'failed', error: 'Front camera permission unavailable' });
    expect(failRes.status).toBe(200);
    expect(failRes.body.data.sos.components.frontImage.status).toBe(COMPONENT_STATUS.FAILED);
    expect(failRes.body.data.sos.components.frontImage.error).toBe('Front camera permission unavailable');
    expect(failRes.body.data.sos.status).toBe(SOS_STATUS.ACTIVE); // SOS itself unaffected

    const backOkRes = await request(app)
      .patch(`/api/sos/${sosId}/media/backImage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'success', storageRef: 'sos/back/abc123.jpg' });
    expect(backOkRes.status).toBe(200);
    expect(backOkRes.body.data.sos.components.backImage.status).toBe(COMPONENT_STATUS.SUCCESS);
    // The earlier front-image failure is untouched by the back-image success.
    expect(backOkRes.body.data.sos.components.frontImage.status).toBe(COMPONENT_STATUS.FAILED);
  });

  test('audio and location failures are recorded independently without affecting each other', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const audioRes = await request(app)
      .patch(`/api/sos/${sosId}/media/audio`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'failed', error: 'Microphone permission unavailable' });
    expect(audioRes.status).toBe(200);
    expect(audioRes.body.data.sos.components.audio.status).toBe(COMPONENT_STATUS.FAILED);

    const locationRes = await request(app)
      .post(`/api/sos/${sosId}/location`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'failed', error: 'Location permission denied' });
    expect(locationRes.status).toBe(200);
    expect(locationRes.body.data.sos.location.status).toBe(COMPONENT_STATUS.FAILED);
    expect(locationRes.body.data.sos.location.error).toBe('Location permission denied');
    // Audio failure from before is still independently recorded.
    expect(locationRes.body.data.sos.components.audio.status).toBe(COMPONENT_STATUS.FAILED);
  });

  test('a valid location report succeeds', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app)
      .post(`/api/sos/${sosId}/location`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 33.6844, longitude: 73.0479 });

    expect(res.status).toBe(200);
    expect(res.body.data.sos.location.status).toBe(COMPONENT_STATUS.SUCCESS);
    expect(res.body.data.sos.location.latitude).toBeCloseTo(33.6844);
  });

  test('persists unsupported and successful non-media service results independently', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const unsupported = await request(app)
      .patch(`/api/sos/${sosId}/service/sms`)
      .set('Authorization', `Bearer ${token}`)
      .send({status: COMPONENT_STATUS.UNSUPPORTED, error: 'Automatic SMS delivery cannot be confirmed'});
    expect(unsupported.status).toBe(200);
    expect(unsupported.body.data.sos.components.sms.status).toBe(COMPONENT_STATUS.UNSUPPORTED);
    expect(unsupported.body.data.sos.components.sms.error).toBe('Automatic SMS delivery cannot be confirmed');

    const success = await request(app)
      .patch(`/api/sos/${sosId}/service/backend`)
      .set('Authorization', `Bearer ${token}`)
      .send({status: COMPONENT_STATUS.SUCCESS});
    expect(success.status).toBe(200);
    expect(success.body.data.sos.components.backend.status).toBe(COMPONENT_STATUS.SUCCESS);
    expect(success.body.data.sos.components.sms.status).toBe(COMPONENT_STATUS.UNSUPPORTED);
    expect(success.body.data.sos.status).toBe(SOS_STATUS.ACTIVE);
  });
});

describe('Admin deactivation', () => {
  test('admin can deactivate an active SOS', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const res = await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sos.status).toBe(SOS_STATUS.DEACTIVATED);

    // Remains in history.
    const stillThere = await Sos.findById(sosId);
    expect(stillThere).not.toBeNull();
    expect(stillThere.status).toBe(SOS_STATUS.DEACTIVATED);
  });

  test('a normal user cannot deactivate any SOS, including their own', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const res = await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test.skip('legacy pending SOS deactivation behavior is no longer part of direct-active creation', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const pendingRes = await request(app)
      .patch(`/api/sos/${sosId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pendingRes.status).toBe(409);

    await request(app).patch(`/api/sos/${sosId}/cancel`).set('Authorization', `Bearer ${token}`);
    const cancelledRes = await request(app)
      .patch(`/api/sos/${sosId}/deactivate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cancelledRes.status).toBe(409);
  });
});

describe('Live location', () => {
  async function createActiveSos(token) {
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);
    return sosId;
  }

  test('owner can start, ping, and stop live location while SOS is active', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const sosId = await createActiveSos(token);

    const startRes = await request(app)
      .post(`/api/sos/${sosId}/live-location/start`)
      .set('Authorization', `Bearer ${token}`);
    expect(startRes.status).toBe(200);
    expect(startRes.body.data.sos.liveLocation.status).toBe(LIVE_LOCATION_STATUS.ACTIVE);

    const pingRes = await request(app)
      .post(`/api/sos/${sosId}/live-location/ping`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 33.7, longitude: 73.05 });
    expect(pingRes.status).toBe(200);

    const stopRes = await request(app)
      .post(`/api/sos/${sosId}/live-location/stop`)
      .set('Authorization', `Bearer ${token}`);
    expect(stopRes.status).toBe(200);
    expect(stopRes.body.data.sos.liveLocation.status).toBe(LIVE_LOCATION_STATUS.STOPPED_BY_USER);
  });

  test('admin can stop another user\'s live location', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const sosId = await createActiveSos(token);

    await request(app).post(`/api/sos/${sosId}/live-location/start`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/sos/${sosId}/live-location/stop`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sos.liveLocation.status).toBe(LIVE_LOCATION_STATUS.STOPPED_BY_ADMIN);
  });

  test('a stranger cannot stop another user\'s live location', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: strangerToken } = await createUserAndLogin({ collectionId: collection._id });
    const sosId = await createActiveSos(token);

    await request(app).post(`/api/sos/${sosId}/live-location/start`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/sos/${sosId}/live-location/stop`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  test('stopping live location does not delete the SOS or its captured media', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const sosId = await createActiveSos(token);

    await request(app)
      .patch(`/api/sos/${sosId}/media/backImage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'success', storageRef: 'sos/back/xyz.jpg' });
    await request(app).post(`/api/sos/${sosId}/live-location/start`).set('Authorization', `Bearer ${token}`);
    await request(app).post(`/api/sos/${sosId}/live-location/stop`).set('Authorization', `Bearer ${token}`);

    const res = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sos.components.backImage.status).toBe(COMPONENT_STATUS.SUCCESS);
  });

  test('live location automatically stops once the 3-hour cutoff has passed (lazy expiry check)', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const sosId = await createActiveSos(token);

    await request(app).post(`/api/sos/${sosId}/live-location/start`).set('Authorization', `Bearer ${token}`);

    // Simulate the 3-hour window having already elapsed, without waiting
    // in real time — this exercises the lazy defense-in-depth check that
    // covers a server restart losing the in-process timer.
    await Sos.updateOne({ _id: sosId }, { $set: { 'liveLocation.expiresAt': new Date(Date.now() - 1000) } });

    const res = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.sos.liveLocation.status).toBe(LIVE_LOCATION_STATUS.STOPPED_MAX_DURATION);

    const pingRes = await request(app)
      .post(`/api/sos/${sosId}/live-location/ping`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 1, longitude: 1 });
    expect(pingRes.status).toBe(409); // no longer active, so a ping is rejected
  });

  test('deactivating an SOS also stops its active live location', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const sosId = await createActiveSos(token);

    await request(app).post(`/api/sos/${sosId}/live-location/start`).set('Authorization', `Bearer ${token}`);
    await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${adminToken}`);

    const sosDoc = await Sos.findById(sosId);
    expect(sosDoc.liveLocation.status).toBe(LIVE_LOCATION_STATUS.STOPPED_SOS_DEACTIVATED);
  });

  test.skip('legacy pre-activation live-location behavior is no longer applicable', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app)
      .post(`/api/sos/${sosId}/live-location/start`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });
});

describe('Emergency link (public, unauthenticated)', () => {
  test('an unknown token returns a generic not-available response', async () => {
    const res = await request(app).get('/api/emergency/thisTokenDoesNotExistAtAll12345');
    expect(res.status).toBe(404);
  });

  test.skip('legacy pending emergency-link visibility is no longer applicable', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const link = created.body.data.sos.emergencyLink;
    const publicToken = link.split('/').pop();

    const res = await request(app).get(`/api/emergency/${publicToken}`);
    expect(res.status).toBe(404);
  });

  test('an active SOS is publicly viewable with safe fields only', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    const link = created.body.data.sos.emergencyLink;
    const publicToken = link.split('/').pop();

    await wait(ACTIVATION_WAIT_MS);

    const res = await request(app).get(`/api/emergency/${publicToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.userName).toBe(user.username);
    expect(res.body.data.userPhone).toBe(user.mobileNumber);
    expect(res.body.data.collectionName).toBe(collection.name);
    expect(res.body.data.status).toBe(SOS_STATUS.ACTIVE);
    // No raw Mongo ids or the token itself anywhere in the payload.
    expect(JSON.stringify(res.body.data)).not.toContain(sosId);
    expect(res.body.data._id).toBeUndefined();
    expect(res.body.data.emergencyToken).toBeUndefined();
  });

  test('a deactivated SOS is no longer publicly viewable, but remains in admin history', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    const link = created.body.data.sos.emergencyLink;
    const publicToken = link.split('/').pop();

    await wait(ACTIVATION_WAIT_MS);
    await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${adminToken}`);

    const publicRes = await request(app).get(`/api/emergency/${publicToken}`);
    expect(publicRes.status).toBe(404);

    const adminRes = await request(app).get(`/api/sos/${sosId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.sos.status).toBe(SOS_STATUS.DEACTIVATED);
  });
});

describe('Notifications', () => {
  test('activating an SOS creates a notification for admins and other collection members, but not the creator', async () => {
    const collection = await createCollection();
    const { token, user } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const { token: memberToken } = await createUserAndLogin({ collectionId: collection._id });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);

    const adminNotifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(adminNotifs.body.data.notifications.some((n) => n.sosId && n.sosId._id === sosId)).toBe(true);
    expect(adminNotifs.body.data.notifications[0].title).toContain(user.username);

    const memberNotifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${memberToken}`);
    expect(memberNotifs.body.data.notifications.length).toBeGreaterThan(0);

    const ownNotifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(ownNotifs.body.data.notifications.length).toBe(0); // creator does not notify themselves
  });

  test('a notification is no longer returned as active once its SOS is deactivated, but is not deleted', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    await wait(ACTIVATION_WAIT_MS);
    await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${adminToken}`);

    const activeOnly = await request(app)
      .get('/api/notifications?onlyActive=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activeOnly.body.data.notifications.length).toBe(0);

    const all = await request(app).get('/api/notifications').set('Authorization', `Bearer ${adminToken}`);
    expect(all.body.data.notifications.length).toBeGreaterThan(0); // still present, just not "active"

    const stillInDb = await Notification.countDocuments({});
    expect(stillInDb).toBeGreaterThan(0);
  });

  test('a user can mark their own notification as read, and cannot mark another user\'s', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const { token: otherAdminToken } = await createUserAndLogin({ role: ROLES.ADMIN });

    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    await wait(ACTIVATION_WAIT_MS);
    void created;

    const adminNotifs = await request(app).get('/api/notifications').set('Authorization', `Bearer ${adminToken}`);
    const notifId = adminNotifs.body.data.notifications[0].id;

    const wrongUserRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${otherAdminToken}`);
    expect(wrongUserRes.status).toBe(403);

    const rightUserRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(rightUserRes.status).toBe(200);
    expect(rightUserRes.body.data.notification.isRead).toBe(true);
  });
});
