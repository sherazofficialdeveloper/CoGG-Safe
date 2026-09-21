describe('FCM provider readiness', () => {
  const original = {
    nodeEnv: process.env.NODE_ENV,
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY,
  };

  afterEach(() => {
    process.env.NODE_ENV = original.nodeEnv;
    process.env.FIREBASE_PROJECT_ID = original.firebaseProjectId;
    process.env.FIREBASE_CLIENT_EMAIL = original.firebaseClientEmail;
    process.env.FIREBASE_PRIVATE_KEY = original.firebasePrivateKey;
    jest.resetModules();
  });

  test('returns unsupported instead of pretending FCM delivery succeeded without real project credentials', async () => {
    process.env.NODE_ENV = 'production';
    process.env.FIREBASE_PROJECT_ID = 'YOUR_FIREBASE_PROJECT_ID';
    process.env.FIREBASE_CLIENT_EMAIL = 'example@project.iam.gserviceaccount.com';
    process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nPLACEHOLDER\n-----END PRIVATE KEY-----\n';

    jest.resetModules();
    const provider = require('../src/services/push/push.provider');

    expect(provider.isConfigured()).toBe(false);
    const result = await provider.sendToToken({
      token: 'device-token-without-firebase',
      title: 'Emergency SOS',
      body: 'Collection alert',
      data: { sosId: 'abc123' },
    });

    expect(result.status).toBe('unsupported');
    expect(result.error).toMatch(/configured/i);
    expect(result.providerMessageId).toBeUndefined();
  });
});
