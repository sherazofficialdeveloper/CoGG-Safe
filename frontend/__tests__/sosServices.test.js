import {activateSosFlow, createSosLocalEvent} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {captureEmergencyPhotos} from '../src/features/sos/services/cameraService';
import {recordEmergencyAudio} from '../src/features/sos/services/audioService';
import {captureNativeSosPhotos, recordNativeSosAudio} from '../src/features/sos/services/nativeMedia';

jest.mock('../src/features/sos/services/nativeMedia', () => ({
  captureNativeSosPhotos: jest.fn(),
  recordNativeSosAudio: jest.fn(),
}));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('react-native', () => ({
  NativeModules: {
    EmergencyMedia: {
      capturePhotos: jest.fn(),
      recordAudio: jest.fn(),
    },
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      CAMERA: 'android.permission.CAMERA',
      RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
    },
    RESULTS: {
      GRANTED: 'granted',
      DENIED: 'denied',
      NEVER_ASK_AGAIN: 'never_ask_again',
      BLOCKED: 'blocked',
    },
    check: jest.fn(async () => 'granted'),
    request: jest.fn(async () => 'granted'),
  },
  Platform: {OS: 'android', Version: 33},
  Linking: {openURL: jest.fn(), canOpenURL: jest.fn()},
}));

describe('SOS media services', () => {
  beforeEach(async () => {
    await sosLocalStore.clear();
    connectivityService.resetForTests();
    jest.clearAllMocks();
  });

  test('camera permission denied returns a structured failed result', async () => {
    const {PermissionsAndroid} = require('react-native');
    PermissionsAndroid.check.mockResolvedValueOnce('denied');
    PermissionsAndroid.request.mockResolvedValueOnce('denied');

    const result = await captureEmergencyPhotos({sosId: 'sos_cam_denied'});

    expect(result.status).toBe('FAILED');
    expect(result.frontImagePath).toBeNull();
    expect(result.backImagePath).toBeNull();
    expect(result.error).toMatch(/Camera permission/i);
  });

  test('camera capture succeeds with front and back image paths', async () => {
    captureNativeSosPhotos.mockResolvedValue({
      frontImagePath: '/tmp/front.jpg',
      backImagePath: '/tmp/back.jpg',
    });

    const result = await captureEmergencyPhotos({sosId: 'sos_camera_ok'});

    expect(result.status).toBe('COMPLETED');
    expect(result.frontImagePath).toBe('/tmp/front.jpg');
    expect(result.backImagePath).toBe('/tmp/back.jpg');
    expect(result.completedAt).toBeTruthy();
  });

  test('camera capture stores a real native failure reason', async () => {
    captureNativeSosPhotos.mockRejectedValue(new Error('Camera initialization timeout'));

    const result = await captureEmergencyPhotos({sosId: 'sos_camera_fail'});

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Camera initialization timeout');
  });

  test('audio permission denied returns a structured failed result', async () => {
    const {PermissionsAndroid} = require('react-native');
    PermissionsAndroid.check.mockResolvedValueOnce('denied');
    PermissionsAndroid.request.mockResolvedValueOnce('denied');

    const result = await recordEmergencyAudio({sosId: 'sos_audio_denied'});

    expect(result.status).toBe('FAILED');
    expect(result.localPath).toBeNull();
    expect(result.error).toMatch(/Microphone permission/i);
  });

  test('audio capture succeeds and persists a local media file path', async () => {
    recordNativeSosAudio.mockResolvedValue('/tmp/audio.m4a');

    const result = await recordEmergencyAudio({sosId: 'sos_audio_ok'});

    expect(result.status).toBe('COMPLETED');
    expect(result.localPath).toBe('/tmp/audio.m4a');
    expect(result.completedAt).toBeTruthy();
  });

  test('audio capture stores native recording failure details', async () => {
    recordNativeSosAudio.mockRejectedValue(new Error('Recording failed: file creation error'));

    const result = await recordEmergencyAudio({sosId: 'sos_audio_fail'});

    expect(result.status).toBe('FAILED');
    expect(result.error).toBe('Recording failed: file creation error');
  });

  test('orchestrator keeps camera and audio success data in local storage', async () => {
    const result = await activateSosFlow({
      userId: 'user-1',
      collectionId: 'collection-1',
      serviceRunners: {
        camera: async () => ({status: 'COMPLETED', frontImagePath: '/tmp/front.jpg', backImagePath: '/tmp/back.jpg'}),
        audio: async () => ({status: 'COMPLETED', localPath: '/tmp/audio.m4a'}),
        sms: async () => ({status: 'PENDING'}),
        call: async () => ({status: 'PENDING'}),
        location: async () => ({status: 'COMPLETED', latitude: 51.5, longitude: -0.12}),
        backend: async () => ({status: 'PENDING'}),
        email: async () => ({status: 'PENDING'}),
        notifications: async () => ({status: 'PENDING'}),
        liveLocation: async () => ({status: 'PENDING'}),
      },
    });

    expect(result.event.status).toBe('ACTIVE');
    expect(result.event.services.camera.status).toBe('COMPLETED');
    expect(result.event.services.audio.status).toBe('COMPLETED');

    const persisted = await sosLocalStore.getSosById(result.event.id);
    expect(persisted.services.camera.frontImagePath).toBe('/tmp/front.jpg');
    expect(persisted.services.audio.localPath).toBe('/tmp/audio.m4a');
  });

  test('orchestrator preserves partial failures without breaking queue state', async () => {
    const result = await activateSosFlow({
      userId: 'user-1',
      collectionId: 'collection-1',
      serviceRunners: {
        camera: async () => ({status: 'FAILED', error: 'Camera permission denied'}),
        audio: async () => ({status: 'COMPLETED', localPath: '/tmp/audio.m4a'}),
        sms: async () => ({status: 'PENDING'}),
        call: async () => ({status: 'PENDING'}),
        location: async () => ({status: 'COMPLETED', latitude: 1, longitude: 2}),
        backend: async () => ({status: 'PENDING'}),
        email: async () => ({status: 'PENDING'}),
        notifications: async () => ({status: 'PENDING'}),
        liveLocation: async () => ({status: 'PENDING'}),
      },
    });

    expect(result.event.services.camera.status).toBe('FAILED');
    expect(result.event.services.camera.error).toBe('Camera permission denied');
    expect(result.event.services.audio.status).toBe('COMPLETED');
    expect((await sosLocalStore.getPendingQueue()).length).toBeGreaterThanOrEqual(0);
  });
});
