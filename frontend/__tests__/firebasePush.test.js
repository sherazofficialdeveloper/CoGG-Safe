describe('firebasePush', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('returns a permission status without crashing when no messaging is present', async () => {
    jest.doMock('@react-native-firebase/messaging', () => ({
      __esModule: true,
      default: null,
    }), {virtual: true});
    jest.doMock('../src/api/client', () => ({
      request: jest.fn(),
    }));

    const {requestFirebasePermission} = require('../src/services/firebasePush');
    const result = await requestFirebasePermission();

    expect(result.status).toBe('unsupported');
  });

  it('registers the current Android device token with the backend using the JWT auth token', async () => {
    const request = jest.fn().mockResolvedValue({status: 'ok'});
    const messaging = {
      AuthorizationStatus: {AUTHORIZED: 1, PROVISIONAL: 2},
      hasPermission: jest.fn().mockResolvedValue(1),
      requestPermission: jest.fn().mockResolvedValue(1),
      registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
      getToken: jest.fn().mockResolvedValue('device-token-123'),
      onMessage: jest.fn(() => jest.fn()),
      onNotificationOpenedApp: jest.fn(() => jest.fn()),
      onTokenRefresh: jest.fn(() => jest.fn()),
      getInitialNotification: jest.fn().mockResolvedValue(null),
      setBackgroundMessageHandler: jest.fn(),
    };

    jest.doMock('@react-native-firebase/messaging', () => ({
      __esModule: true,
      default: jest.fn(() => messaging),
    }), {virtual: true});
    jest.doMock('../src/api/client', () => ({request}));

    const {registerDeviceToken} = require('../src/services/firebasePush');
    const result = await registerDeviceToken('jwt-token');

    expect(result.status).toBe('registered');
    expect(request).toHaveBeenCalledWith('/push-tokens', {
      method: 'POST',
      token: 'jwt-token',
      body: {
        token: 'device-token-123',
        platform: 'android',
      },
    });
  });

  it('subscribes to foreground, app-open, and token refresh callbacks', () => {
    const onForegroundMessage = jest.fn();
    const onOpenedFromNotification = jest.fn();
    const onTokenRefresh = jest.fn();
    const messaging = {
      AuthorizationStatus: {AUTHORIZED: 1, PROVISIONAL: 2},
      hasPermission: jest.fn().mockResolvedValue(1),
      requestPermission: jest.fn().mockResolvedValue(1),
      registerDeviceForRemoteMessages: jest.fn().mockResolvedValue(undefined),
      getToken: jest.fn().mockResolvedValue('device-token-123'),
      onMessage: jest.fn(() => jest.fn()),
      onNotificationOpenedApp: jest.fn(() => jest.fn()),
      onTokenRefresh: jest.fn(() => jest.fn()),
      getInitialNotification: jest.fn().mockResolvedValue(null),
      setBackgroundMessageHandler: jest.fn(),
    };

    jest.doMock('@react-native-firebase/messaging', () => ({
      __esModule: true,
      default: jest.fn(() => messaging),
    }), {virtual: true});
    jest.doMock('../src/api/client', () => ({request: jest.fn()}));

    const {observeFirebaseNotifications} = require('../src/services/firebasePush');
    const unsubscribe = observeFirebaseNotifications({
      onForegroundMessage,
      onOpenedFromNotification,
      onTokenRefresh,
    });

    const foregroundHandler = messaging.onMessage.mock.calls[0][0];
    const openedHandler = messaging.onNotificationOpenedApp.mock.calls[0][0];
    const tokenRefreshHandler = messaging.onTokenRefresh.mock.calls[0][0];

    foregroundHandler({data: {body: 'New alert'}});
    openedHandler({data: {body: 'Opened'}});
    tokenRefreshHandler('new-token-456');

    expect(onForegroundMessage).toHaveBeenCalledWith({data: {body: 'New alert'}});
    expect(onOpenedFromNotification).toHaveBeenCalledWith({data: {body: 'Opened'}});
    expect(onTokenRefresh).toHaveBeenCalledWith('new-token-456');

    unsubscribe();
  });
});
