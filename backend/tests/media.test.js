process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';
process.env.SOS_CANCELLATION_WINDOW_SECONDS = '1';
process.env.SCHEDULER_POLL_INTERVAL_MS = '150';
process.env.STORAGE_LOCAL_PATH = 'test-uploads-media';
process.env.MEDIA_MAX_UPLOAD_SIZE_MB = '1';

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');
const schedulerService = require('../src/modules/scheduler/scheduler.service');
const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
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
  const uploadsDir = path.join(process.cwd(), process.env.STORAGE_LOCAL_PATH);
  fs.rmSync(uploadsDir, { recursive: true, force: true });
  await dbHandler.closeDatabase();
});

let counter = 0;
async function createUserAndLogin({ role = ROLES.USER, collectionId = null } = {}) {
  counter += 1;
  const user = new User({
    username: `${role}${counter}`,
    mobileNumber: `0300${String(5000000 + counter)}`,
    role,
    collectionId,
  });
  await user.setPassword('Passw0rd!');
  await user.save();

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: user.username, password: 'Passw0rd!' });

  return { user, token: loginRes.body.data.token };
}

async function createCollection() {
  return Collection.create({ type: 'family', name: 'Test Family', emergencyCallNumber: '15' });
}

const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/2wBDAQMDAwQDBAgEBAgQCwkLEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBD/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
  'base64'
);

describe('Media upload (front/back image, audio)', () => {
  test('owner can upload a front image; it is stored, isolated to this SOS, and independently retrievable', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const uploadRes = await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' });

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.sos.components.frontImage.status).toBe(COMPONENT_STATUS.SUCCESS);
    expect(uploadRes.body.data.sos.components.frontImage.storageRef).toContain(sosId);

    const fileRes = await request(app)
      .get(`/api/sos/${sosId}/media/frontImage/file`)
      .set('Authorization', `Bearer ${token}`);
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(fileRes.body, TINY_JPEG)).toBe(0);
  });

  test('a stranger cannot retrieve another user\'s uploaded media', async () => {
    const collection = await createCollection();
    const { token: ownerToken } = await createUserAndLogin({ collectionId: collection._id });
    const { token: strangerToken } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${ownerToken}`).send({});
    const sosId = created.body.data.sos.id;

    await request(app)
      .patch(`/api/sos/${sosId}/media/backImage/upload`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', TINY_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' });

    const res = await request(app)
      .get(`/api/sos/${sosId}/media/backImage/file`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(403);
  });

  test('admin can retrieve any user\'s uploaded media', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    await request(app)
      .patch(`/api/sos/${sosId}/media/audio/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_JPEG, { filename: 'clip.mp3', contentType: 'audio/mpeg' });

    const res = await request(app)
      .get(`/api/sos/${sosId}/media/audio/file`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('an unsupported file type for the given component is rejected without affecting other components', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not an image'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);

    const backImageRes = await request(app)
      .patch(`/api/sos/${sosId}/media/backImage/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_JPEG, { filename: 'back.jpg', contentType: 'image/jpeg' });
    expect(backImageRes.status).toBe(200); // unaffected by the earlier rejected upload
  });

  test('a file exceeding the configured size limit is rejected with a clear 400, not a 500', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const oversized = Buffer.alloc(2 * 1024 * 1024, 1); // 2MB > 1MB configured limit

    const res = await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('media reported via the no-binary endpoint still works independently', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    const res = await request(app)
      .patch(`/api/sos/${sosId}/media/audio`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'failed', error: 'Microphone unavailable' });

    expect(res.status).toBe(200);
    expect(res.body.data.sos.components.audio.status).toBe(COMPONENT_STATUS.FAILED);
  });

  test('SECURITY: a client-supplied storageRef attempting path traversal cannot read files outside the upload directory', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;

    // Report a malicious storageRef via the no-binary endpoint (the only
    // endpoint where a client controls this value directly).
    const reportRes = await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'success', storageRef: '../../../../../../../../etc/passwd' });
    expect(reportRes.status).toBe(200); // reporting the reference itself is allowed

    // Attempting to retrieve it must be blocked, not stream an arbitrary file.
    const fileRes = await request(app)
      .get(`/api/sos/${sosId}/media/frontImage/file`)
      .set('Authorization', `Bearer ${token}`);
    expect(fileRes.status).toBe(400);
    expect(fileRes.body.success).toBe(false);
  });

  test('an active SOS\'s uploaded media is publicly retrievable via the emergency link; deactivation stops it', async () => {
    const collection = await createCollection();
    const { token } = await createUserAndLogin({ collectionId: collection._id });
    const { token: adminToken } = await createUserAndLogin({ role: ROLES.ADMIN });
    const created = await request(app).post('/api/sos').set('Authorization', `Bearer ${token}`).send({});
    const sosId = created.body.data.sos.id;
    const publicToken = created.body.data.sos.emergencyLink.split('/').pop();

    await request(app)
      .patch(`/api/sos/${sosId}/media/frontImage/upload`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_JPEG, { filename: 'front.jpg', contentType: 'image/jpeg' });

    await wait(ACTIVATION_WAIT_MS);

    const publicViewRes = await request(app).get(`/api/emergency/${publicToken}`);
    expect(publicViewRes.body.data.media.frontImage.status).toBe(COMPONENT_STATUS.SUCCESS);
    expect(publicViewRes.body.data.media.frontImage.url).toContain(`/api/emergency/${publicToken}/media/frontImage`);

    const publicFileRes = await request(app).get(`/api/emergency/${publicToken}/media/frontImage`);
    expect(publicFileRes.status).toBe(200);
    expect(Buffer.compare(publicFileRes.body, TINY_JPEG)).toBe(0);

    await request(app).patch(`/api/sos/${sosId}/deactivate`).set('Authorization', `Bearer ${adminToken}`);

    const afterDeactivation = await request(app).get(`/api/emergency/${publicToken}/media/frontImage`);
    expect(afterDeactivation.status).toBe(404);
  });
});
