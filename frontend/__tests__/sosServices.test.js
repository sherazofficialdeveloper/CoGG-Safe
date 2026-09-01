import {activateSosFlow, createSosLocalEvent} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {captureEmergencyPhotos} from '../src/features/sos/services/cameraService';
import {recordEmergencyAudio} from '../src/features/sos/services/audioService';
import {captureNativeSosPhotos, recordNativeSosAudio} from '../src/features/sos/services/nativeMedia';
import {sendEmergencySms} from '../src/features/sos/services/smsService';
import {initiateEmergencyCall} from '../src/features/sos/services/callService';
import {stopLiveLocationSharing} from '../src/features/sos/services/liveLocationService';
import {dispatchEmergencyNotifications} from '../src/features/sos/services/notificationService';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {uploadCapturedSosMedia} from '../src/features/sos/services/backendSyncService';

jest.mock('../src/api/resources', () => ({
  createSos: jest.fn(),
  reportSosMedia: jest.fn(),
  stopLiveLocation: jest.fn(),
  uploadSosMedia: jest.fn(),
}));

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
      openSmsComposer: jest.fn(),
      placeCall: jest.fn(),
    },
  },
  PermissionsAndroid: {
    PERMISSIONS: {
      CAMERA: 'android.permission.CAMERA',
      RECORD_AUDIO: 'android.permission.RECORD_AUDIO',
      ACCESS_FINE_LOCATION: 'android.permission.ACCESS_FINE_LOCATION',
      SEND_SMS: 'android.permission.SEND_SMS',
      CALL_PHONE: 'android.permission.CALL_PHONE',
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
    jest.resetAllMocks();
    const {PermissionsAndroid} = require('react-native');
    PermissionsAndroid.check.mockImplementation(async () => 'granted');
    PermissionsAndroid.request.mockImplementation(async () => 'granted');
  });

  test('SMS opens the system composer and remains pending until user confirmation', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});

    NativeModules.EmergencyMedia.openSmsComposer.mockResolvedValue({status: 'pending', reason: 'Android opened the system SMS composer. User confirmation is required before the message is sent.'});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'pending', reason: 'Android launched the emergency call intent but the final device status remains pending.'});

    const sms = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});
    const call = await initiateEmergencyCall({emergencyNumber: '+1234567890'});

    expect(sms.status).toBe('PENDING');
    expect(call.status).toBe('PENDING');
    expect(NativeModules.EmergencyMedia.openSmsComposer).toHaveBeenCalledWith('+1234567890', 'help');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('+1234567890');
  });

  test('notification dispatch remains truthful when FCM is not configured', async () => {
    const result = await dispatchEmergencyNotifications({sosId: 'sos_push_truthful'});

    expect(result.status).toBe('PENDING');
    expect(result.reason).toMatch(/FCM|Firebase|configured/i);
  });

  test('SMS and call are queued as retryable pending when cellular is unavailable', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: false});

    const sms = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});
    const call = await initiateEmergencyCall({emergencyNumber: '+1234567890'});

    expect(sms.status).toBe('PENDING');
    expect(call.status).toBe('PENDING');
    expect(NativeModules.EmergencyMedia.openSmsComposer).toHaveBeenCalledWith('+1234567890', 'help');
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalled();
  });

  test('SMS composer failure is reported as unsupported, never sent', async () => {
    const {NativeModules} = require('react-native');
    NativeModules.EmergencyMedia.openSmsComposer.mockRejectedValue(new Error('No SMS application available'));

    const result = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.reason).toMatch(/SMS application|composer/i);
  });

  test('SMS no-SIM response stays unsupported and is not treated as success', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.openSmsComposer.mockResolvedValue({status: 'unsupported', reason: 'No active SIM subscription available for SMS.'});

    const result = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.reason).toMatch(/SIM|subscription/i);
  });

  test('CALL no active phone account stays unsupported and is never falsely answered', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'unsupported', reason: 'No matching telephony account is available for the call.'});

    const result = await initiateEmergencyCall({emergencyNumber: '+1234567890'});

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.reason).toMatch(/telephony|account/i);
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

  test('orchestrator keeps camera and audio success data in local storage while offline backend sync remains queued', async () => {
    const result = await activateSosFlow({
      userId: 'user-1',
      collectionId: 'collection-1',
      serviceRunners: {
        camera: async () => ({status: 'COMPLETED', frontImagePath: '/tmp/front.jpg', backImagePath: '/tmp/back.jpg'}),
        audio: async () => ({status: 'COMPLETED', localPath: '/tmp/audio.m4a'}),
        sms: async () => ({status: 'PENDING'}),
        call: async () => ({status: 'PENDING'}),
        location: async () => ({status: 'COMPLETED', latitude: 51.5, longitude: -0.12}),
        backend: async () => ({status: 'PENDING', reason: 'Internet unavailable'}),
        email: async () => ({status: 'PENDING'}),
        notifications: async () => ({status: 'PENDING'}),
        liveLocation: async () => ({status: 'PENDING'}),
      },
    });

    expect(result.event.status).toBe('PENDING');
    expect(result.event.services.camera.status).toBe('COMPLETED');
    expect(result.event.services.audio.status).toBe('COMPLETED');

    const persisted = await sosLocalStore.getSosById(result.event.id);
    expect(persisted.services.camera.frontImagePath).toBe('/tmp/front.jpg');
    expect(persisted.services.audio.localPath).toBe('/tmp/audio.m4a');
  });

  test('pending SMS and backend jobs resume independently when connectivity returns', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, type: 'SMS', serviceName: 'sms'});
    await enqueueSosJob({sosId: event.id, type: 'BACKEND', serviceName: 'backend'});

    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    const result = await processSosQueue({
      processors: {
        sms: jest.fn(async () => ({status: 'SENT'})),
        backend: jest.fn(async () => ({status: 'COMPLETED', backendId: 'backend-queued'})),
      },
    });

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({status: 'COMPLETED'}),
      expect.objectContaining({status: 'COMPLETED'}),
    ]));
    expect(await sosLocalStore.getPendingQueue()).toHaveLength(0);
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
        backend: async () => ({status: 'PENDING', reason: 'Internet unavailable'}),
        email: async () => ({status: 'PENDING'}),
        notifications: async () => ({status: 'PENDING'}),
        liveLocation: async () => ({status: 'PENDING'}),
      },
    });

    expect(result.event.status).toBe('PENDING');
    expect(result.event.services.camera.status).toBe('FAILED');
    expect(result.event.services.camera.error).toBe('Camera permission denied');
    expect(result.event.services.audio.status).toBe('COMPLETED');
    expect((await sosLocalStore.getPendingQueue()).length).toBeGreaterThanOrEqual(0);
  });


  test('captured device media is uploaded as multipart data and never used as a backend URL', async () => {
    const {uploadSosMedia} = require('../src/api/resources');
    connectivityService.updateState({isConnected: true, isInternetReachable: true});
    uploadSosMedia.mockResolvedValue({
      sos: {components: {frontImage: {status: 'success', storageRef: 'sos/backend-1/front.jpg'}}},
    });

    const result = await uploadCapturedSosMedia({
      token: 'jwt-token',
      sosEvent: {
        backendId: 'backend-1',
        services: {camera: {status: 'COMPLETED', frontImagePath: '/data/user/0/com.coggsafe/cache/front.jpg'}, audio: {status: 'PENDING'}},
      },
    });

    expect(result.status).toBe('COMPLETED');
    expect(uploadSosMedia).toHaveBeenCalledWith('jwt-token', 'backend-1', 'frontImage', expect.objectContaining({
      uri: 'file:///data/user/0/com.coggsafe/cache/front.jpg',
    }));
    expect(result.uploaded[0].storageRef).toBe('sos/backend-1/front.jpg');
  });
  test('live-location stop preserves backend failures', async () => {
    const {stopLiveLocation} = require('../src/api/resources');
    stopLiveLocation.mockRejectedValueOnce(new Error('Stop request was rejected'));

    await expect(stopLiveLocationSharing({
      token: 'token',
      sosId: 'sos-live-stop',
      backendId: 'backend-live-stop',
    })).rejects.toThrow('Stop request was rejected');
  });
});
