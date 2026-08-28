process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';

const request = require('supertest');
const dbHandler = require('./testUtils/dbHandler');
const app = require('../src/app');

beforeAll(async () => {
  await dbHandler.connect();
});

afterAll(async () => {
  await dbHandler.closeDatabase();
});

describe('GET /api/health (liveness)', () => {
  test('always returns 200, with no auth required', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });
});

describe('GET /api/health/ready (readiness)', () => {
  test('reports ready when MongoDB is connected', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.mongoConnected).toBe(true);
  });

  test('reports not-ready (503) when MongoDB is disconnected', async () => {
    await dbHandler.disconnect();

    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.data.mongoConnected).toBe(false);

    // Reconnect to the SAME in-memory server (not a new one) so
    // subsequent tests in this file aren't affected and no server
    // process is leaked.
    await dbHandler.reconnect();
  });
});

describe('CORS configuration', () => {
  test('does not combine a wildcard origin with credentials (spec-invalid, and unnecessary for Bearer-token auth)', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://example.com');
    // Default CLIENT_ORIGIN is '*' in this test env — credentials must
    // not be advertised alongside it.
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });
});
