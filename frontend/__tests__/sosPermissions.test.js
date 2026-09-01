const mockCheck = jest.fn();
const mockRequestMultiple = jest.fn();
const mockRequest = jest.fn();
const mockAddEventListener = jest.fn();
const mockOpenSettings = jest.fn();

const LOCATION = 'android.permission.ACCESS_FINE_LOCATION';
const CAMERA = 'android.permission.CAMERA';
const AUDIO = 'android.permission.RECORD_AUDIO';
const SMS = 'android.permission.SEND_SMS';
const CALL = 'android.permission.CALL_PHONE';
const NOTIFICATIONS = 'android.permission.POST_NOTIFICATIONS';

jest.mock('react-native', () => ({
  AppState: {addEventListener: mockAddEventListener},
  Linking: {openSettings: mockOpenSettings},
  PermissionsAndroid: {
    PERMISSIONS: {
      ACCESS_FINE_LOCATION: LOCATION,
      CAMERA,
      RECORD_AUDIO: AUDIO,
      SEND_SMS: SMS,
      CALL_PHONE: CALL,
      POST_NOTIFICATIONS: NOTIFICATIONS,
    },
    RESULTS: {GRANTED: 'granted', DENIED: 'denied', NEVER_ASK_AGAIN: 'never_ask_again'},
    check: mockCheck,
    requestMultiple: mockRequestMultiple,
    request: mockRequest,
  },
  Platform: {OS: 'android', Version: 34},
}));

const {
  checkSosPermissions,
  createInitialSosPermissionState,
  markPermissionOnboardingSkipped,
  openSosPermissionSettings,
  requestSosPermissions,
  requestRequiredPermissions,
  subscribeToPermissionChanges,
} = require('../src/permissions/sosPermissions');
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const granted = {
  [LOCATION]: 'granted',
  [CAMERA]: 'granted',
  [AUDIO]: 'granted',
  [NOTIFICATIONS]: 'granted',
};

afterEach(() => jest.clearAllMocks());

test('starts in a safe checking state', () => {
  expect(createInitialSosPermissionState()).toMatchObject({
    location: 'denied', camera: 'denied', audio: 'denied', notifications: 'denied',
    allRequiredGranted: false, isChecking: true,
  });
});

test('reports all required permissions granted', async () => {
  mockCheck.mockResolvedValue(true);
  await expect(checkSosPermissions()).resolves.toMatchObject({
    location: 'granted', camera: 'granted', audio: 'granted', notifications: 'granted',
    allRequiredGranted: true, isChecking: false, canRequest: true,
  });
  expect(mockCheck).toHaveBeenCalledWith(LOCATION);
  expect(mockCheck).toHaveBeenCalledWith(CAMERA);
  expect(mockCheck).toHaveBeenCalledWith(AUDIO);
  expect(mockCheck).toHaveBeenCalledWith(NOTIFICATIONS);
  expect(mockCheck).not.toHaveBeenCalledWith(SMS);
});

test('reports partial permissions as not ready', async () => {
  mockCheck.mockImplementation(permission => Promise.resolve(permission !== CAMERA));
  await expect(checkSosPermissions()).resolves.toMatchObject({
    location: 'granted', camera: 'denied', allRequiredGranted: false, isChecking: false,
  });
});

test('preserves permanently blocked state after a request', async () => {
  mockCheck.mockResolvedValue(false);
  mockRequest.mockResolvedValue('never_ask_again');
  await expect(requestRequiredPermissions()).resolves.toMatchObject({
    audio: 'never_ask_again', allRequiredGranted: false, canRequest: false,
  });
});

test('requests only permissions that are not already granted', async () => {
  mockCheck.mockImplementation(permission => Promise.resolve(permission !== CAMERA));
  mockRequest.mockResolvedValue('granted');

  await requestSosPermissions();

  expect(mockRequest).toHaveBeenCalledWith(CAMERA);
  expect(mockRequest).not.toHaveBeenCalledWith(SMS);
});

test('does not trust completed onboarding when native permissions are missing', async () => {
  AsyncStorage.getItem.mockResolvedValue('true');
  mockCheck.mockImplementation(permission => Promise.resolve(permission !== AUDIO));

  await expect(require('../src/permissions/sosPermissions').shouldShowPermissionOnboarding()).resolves.toBe(true);
});

test('skips onboarding when all native permissions are granted', async () => {
  AsyncStorage.getItem.mockResolvedValue(null);
  mockCheck.mockResolvedValue(true);

  await expect(require('../src/permissions/sosPermissions').shouldShowPermissionOnboarding()).resolves.toBe(false);
});

test('remembers a declined onboarding and lets Home own the recovery warning', async () => {
  AsyncStorage.getItem.mockReset();
  AsyncStorage.getItem.mockResolvedValueOnce(null).mockResolvedValueOnce('true');
  await markPermissionOnboardingSkipped();
  mockCheck.mockImplementation(permission => Promise.resolve(permission !== LOCATION));

  await expect(require('../src/permissions/sosPermissions').shouldShowPermissionOnboarding()).resolves.toBe(false);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('@coggsafe/permission-onboarding-skipped', 'true');
});

test('opens system settings for a permanently blocked permission', async () => {
  mockOpenSettings.mockResolvedValue();
  await expect(openSosPermissionSettings()).resolves.toBe(true);
});

test('fails closed when the native permission API throws', async () => {
  mockCheck.mockRejectedValue(new Error('native failure'));
  await expect(checkSosPermissions()).resolves.toMatchObject({
    allRequiredGranted: false, isChecking: false,
  });
});

test('refreshes permission state when the app becomes active', () => {
  const onChange = jest.fn();
  const remove = jest.fn();
  mockAddEventListener.mockReturnValue({remove});
  const unsubscribe = subscribeToPermissionChanges(onChange);
  const handler = mockAddEventListener.mock.calls[0][1];
  handler('background');
  handler('active');
  expect(onChange).toHaveBeenCalledTimes(1);
  unsubscribe();
  expect(remove).toHaveBeenCalledTimes(1);
});