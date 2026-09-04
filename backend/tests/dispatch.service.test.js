process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_secret_key_for_jest_do_not_use_in_prod';
process.env.MONGODB_URI = 'mongodb://placeholder-not-used-see-dbHandler';
process.env.EMERGENCY_LINK_BASE_URL = 'http://localhost:8000/e';

// Pure unit test: every collaborator is mocked so this exercises only
// dispatch.service's own message-building logic (the email body content),
// not the database, network, or real SMTP/FCM providers.
jest.mock('../src/modules/users/user.model');
jest.mock('../src/modules/collections/collection.model');
jest.mock('../src/modules/notifications/notification.service');
jest.mock('../src/modules/notifications/pushToken.service');
jest.mock('../src/services/push/push.provider');
jest.mock('../src/services/email/email.provider');
// component.util persists each component's status via a direct Mongoose
// call — mocked out so this test never needs a real database connection.
jest.mock('../src/modules/sos/component.util', () => ({
  setComponentStatus: jest.fn().mockResolvedValue(undefined),
}));

const User = require('../src/modules/users/user.model');
const Collection = require('../src/modules/collections/collection.model');
const notificationService = require('../src/modules/notifications/notification.service');
const emailProvider = require('../src/services/email/email.provider');
const { dispatchSos } = require('../src/modules/sos/dispatch.service');
const { setComponentStatus } = require('../src/modules/sos/component.util');

function buildSos(overrides = {}) {
  return {
    _id: 'sos123',
    userId: 'user123',
    collectionId: 'collection123',
    emergencyMessage: 'I am testuser. I may be in danger. Please help me.',
    emergencyToken: 'AbC123SecureTokenValueLongEnough',
    createdAt: new Date('2026-01-15T10:30:00Z'),
    location: { latitude: null, longitude: null },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  User.findById.mockResolvedValue({ _id: 'user123', username: 'testuser' });
  Collection.findById.mockResolvedValue({ _id: 'collection123', name: 'Test Family' });
  notificationService.getRecipientsForSos.mockResolvedValue([
    { _id: 'recipient1', email: 'contact@example.com' },
  ]);
  notificationService.createForSos.mockResolvedValue([]);
  emailProvider.send.mockResolvedValue({ status: 'sent', providerMessageId: 'abc' });
});

describe('dispatch.service email content', () => {
  test('email body includes the canonical emergency link', async () => {
    await dispatchSos(buildSos());

    expect(emailProvider.send).toHaveBeenCalledTimes(1);
    const { body } = emailProvider.send.mock.calls[0][0];
    expect(body).toContain('http://localhost:8000/e/AbC123SecureTokenValueLongEnough');
  });

  test('email subject identifies the user', async () => {
    await dispatchSos(buildSos());

    const { subject } = emailProvider.send.mock.calls[0][0];
    expect(subject).toContain('testuser');
  });

  test('email body includes a human-readable timestamp', async () => {
    await dispatchSos(buildSos());

    const { body } = emailProvider.send.mock.calls[0][0];
    // Exact formatting is locale-dependent; just confirm some rendering of
    // the createdAt date made it into the body rather than being omitted.
    const expectedTimestamp = new Date('2026-01-15T10:30:00Z').toLocaleString();
    expect(body).toContain(expectedTimestamp);
  });

  test('email body includes a last-known-location line when a location exists', async () => {
    await dispatchSos(buildSos({ location: { latitude: 12.34, longitude: 56.78 } }));

    const { body } = emailProvider.send.mock.calls[0][0];
    expect(body).toContain('https://maps.google.com/?q=12.34,56.78');
  });

  test('email body omits the location line when no location is available', async () => {
    await dispatchSos(buildSos({ location: { latitude: null, longitude: null } }));

    const { body } = emailProvider.send.mock.calls[0][0];
    expect(body).not.toContain('maps.google.com');
  });

  test('a missing recipient email does not throw and email is simply skipped', async () => {
    notificationService.getRecipientsForSos.mockResolvedValue([{ _id: 'recipient1', email: undefined }]);

    await expect(dispatchSos(buildSos())).resolves.not.toThrow();
    expect(emailProvider.send).not.toHaveBeenCalled();
  });

  test('provider pending/processing outcomes become unknown, not a permanent timeout failure', async () => {
    emailProvider.send.mockResolvedValue({ status: 'pending' });

    await dispatchSos(buildSos());

    expect(setComponentStatus).toHaveBeenCalledWith(
      'sos123',
      'email',
      'unknown',
      { error: 'Email delivery could not be confirmed' },
    );
    expect(setComponentStatus).not.toHaveBeenCalledWith(
      'sos123',
      'email',
      'failed',
      expect.anything(),
    );
  });

  test('email timeout is an unknown delivery outcome and does not leave processing/pending', async () => {
    const timeout = new Error('Email send timeout after 10 seconds');
    timeout.code = 'EMAIL_DELIVERY_UNKNOWN';
    emailProvider.send.mockRejectedValue(timeout);

    await dispatchSos(buildSos());

    expect(setComponentStatus).toHaveBeenCalledWith(
      'sos123',
      'email',
      'unknown',
      { error: 'Email delivery could not be confirmed' },
    );
  });
});
