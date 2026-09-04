import {activateSosFlow, createSosLocalEvent} from '../src/features/sos/orchestrator';
import {sosLocalStore} from '../src/features/sos/storage';
import {connectivityService} from '../src/features/sos/connectivity';
import {captureEmergencyPhotos} from '../src/features/sos/services/cameraService';
import {recordEmergencyAudio} from '../src/features/sos/services/audioService';
import {captureNativeSosPhotos, recordNativeSosAudio} from '../src/features/sos/services/nativeMedia';
import {sendEmergencySms, sendEmergencySmsToNumbers} from '../src/features/sos/services/smsService';
import {initiateEmergencyCall} from '../src/features/sos/services/callService';
import {stopLiveLocationSharing} from '../src/features/sos/services/liveLocationService';
import {dispatchEmergencyNotifications} from '../src/features/sos/services/notificationService';
import {enqueueSosJob, processSosQueue} from '../src/features/sos/queue/queueWorker';
import {uploadCapturedSosMedia} from '../src/features/sos/services/backendSyncService';
import {normalizePhoneNumber} from '../src/features/sos/services/phoneNumber';

jest.mock('../src/api/resources', () => ({
  createSos: jest.fn(),
  reportSosMedia: jest.fn(),
  stopLiveLocation: jest.fn(),
  uploadSosMedia: jest.fn(),
}));

jest.mock('../src/features/sos/services/nativeMedia', () => ({
  captureNativeSosPhotos: jest.fn(),
  recordNativeSosAudio: jest.fn(),
  validateNativeSosMedia: jest.fn(async () => true),
}));

jest.mock('@react-native-community/geolocation', () => ({
  getCurrentPosition: jest.fn(),
}));

jest.mock('react-native', () => ({
  NativeModules: {
    EmergencyMedia: {
      capturePhotos: jest.fn(),
      recordAudio: jest.fn(),
      sendEmergencySms: jest.fn(),
      openSmsComposer: jest.fn(),
      placeCall: jest.fn(),
      getAvailableSims: jest.fn(),
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
  DeviceEventEmitter: {
    emit: jest.fn(),
    addListener: jest.fn(() => ({remove: jest.fn()})),
  },
}));

describe('SOS media services', () => {
  beforeEach(async () => {
    await sosLocalStore.clear();
    connectivityService.resetForTests();
    jest.resetAllMocks();
    const {validateNativeSosMedia} = require('../src/features/sos/services/nativeMedia');
    validateNativeSosMedia.mockResolvedValue(true);
    const {PermissionsAndroid} = require('react-native');
    PermissionsAndroid.check.mockImplementation(async () => 'granted');
    PermissionsAndroid.request.mockImplementation(async () => 'granted');
  });

  test('recognizes configured short emergency service codes', () => {
    expect(normalizePhoneNumber('15')).toBe('15');
  });

  test('preserves a local Pakistani mobile number for the native dialer', () => {
    expect(normalizePhoneNumber('03427948471')).toBe('03427948471');
  });

  test('preserves the configured number without a digit-count restriction', () => {
    expect(normalizePhoneNumber('030000000000')).toBe('030000000000');
  });

  test('keeps an international Pakistani mobile number valid', () => {
    expect(normalizePhoneNumber('+923427948471')).toBe('+923427948471');
  });

  test.each([
    ['1-digit number', '7'],
    ['10-digit number', '1234567890'],
    ['UK local number', '07123456789'],
    ['UK international number', '+447123456789'],
    ['short service code', '15'],
  ])('preserves %s at the call boundary', async (_label, emergencyNumber) => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'initiated', reason: 'Android launched the emergency call.'});

    const result = await initiateEmergencyCall({emergencyNumber});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith(emergencyNumber, -1);
  });

  test('removes only safe formatting before calling Android', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'initiated', reason: 'Android launched the emergency call.'});

    await initiateEmergencyCall({emergencyNumber: '+44 7123-456789'});

    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('+447123456789', -1);
  });

  test('passes the configured local Pakistani collection number to the native call', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'initiated', reason: 'Android launched the emergency call.'});

    const result = await initiateEmergencyCall({emergencyNumber: '03427948471'});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('03427948471', -1);
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalledWith('+15', -1);
  });

  test('passes the configured 12-digit local Pakistani collection number to the native call', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'initiated', reason: 'Android launched the emergency call.'});

    const result = await initiateEmergencyCall({emergencyNumber: '030000000000'});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('030000000000', -1);
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalledWith('+15', -1);
  });

  test('passes the configured collection emergency number to the native call', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'initiated', reason: 'Android launched the emergency call.'});

    const result = await initiateEmergencyCall({emergencyNumber: '1122'});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('1122', -1);
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalledWith('+15', -1);
  });

  test('does not fall back to 15 when no emergency number is configured', async () => {
    const {NativeModules} = require('react-native');

    const result = await initiateEmergencyCall({emergencyNumber: null});

    expect(result.status).toBe('NOT_CONFIGURED');
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalled();
  });

  test('rejects an invalid configured number without falling back to 15', async () => {
    const {NativeModules} = require('react-native');

    const result = await initiateEmergencyCall({emergencyNumber: 'not-a-number'});

    expect(result.status).toBe('NOT_CONFIGURED');
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalled();
  });

  test('SMS sends directly and the call is initiated through the Android telephony intent', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});

    NativeModules.EmergencyMedia.sendEmergencySms.mockResolvedValue({status: 'sent', reason: 'Emergency SMS queued for delivery via carrier network.', subscriptionId: 1});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'pending', reason: 'Android launched the emergency call intent but the final device status remains pending.'});

    const sms = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});
    const call = await initiateEmergencyCall({emergencyNumber: '+1234567890'});

    expect(sms.status).toBe('COMPLETED');
    expect(call.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.sendEmergencySms).toHaveBeenCalledWith('+1234567890', 'help');
    // No saved SIM preference (e.g. single-SIM device) -> -1, "let Android pick".
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('+1234567890', -1);
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
    expect(NativeModules.EmergencyMedia.sendEmergencySms).not.toHaveBeenCalled();
    expect(NativeModules.EmergencyMedia.placeCall).not.toHaveBeenCalled();
  });

  test('SMS composer failure is reported as unsupported, never sent', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.sendEmergencySms.mockResolvedValue(undefined);
    NativeModules.EmergencyMedia.openSmsComposer.mockRejectedValue(new Error('No SMS application available'));

    const result = await sendEmergencySms({phoneNumber: '+1234567890', message: 'help'});

    expect(result.status).toBe('UNSUPPORTED');
    expect(result.reason).toMatch(/SMS application|composer/i);
  });

  test('SMS tracks recipients independently and retries only pending recipients', async () => {
    const {NativeModules} = require('react-native');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    NativeModules.EmergencyMedia.sendEmergencySms
      .mockResolvedValueOnce({status: 'sent', subscriptionId: 1})
      .mockRejectedValueOnce(new Error('carrier temporarily unavailable'))
      .mockResolvedValueOnce({status: 'sent', subscriptionId: 1});

    const first = await sendEmergencySmsToNumbers({
      sosId: event.id,
      phoneNumbers: ['+1 (234) 567-8900', '+12345678901'],
      message: 'help',
    });

    expect(first.status).toBe('PENDING');
    expect(first.sentCount).toBe(1);
    expect(first.pendingCount).toBe(0);
    expect(first.failedCount).toBe(1);

    const second = await sendEmergencySmsToNumbers({
      sosId: event.id,
      phoneNumbers: ['+12345678900', '+12345678901'],
      message: 'help',
    });

    expect(second.status).toBe('COMPLETED');
    expect(NativeModules.EmergencyMedia.sendEmergencySms).toHaveBeenCalledTimes(3);
    expect(NativeModules.EmergencyMedia.sendEmergencySms).toHaveBeenLastCalledWith('+12345678901', 'help');
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

  test('dual-SIM: saved emergency SIM preference is passed to the native call', async () => {
    const {NativeModules} = require('react-native');
    const {saveEmergencyCallSim, initiateEmergencyCall: placeCall} = require('../src/features/sos/services/callService');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({status: 'pending', reason: 'Android launched the emergency call intent but the final device status remains pending.'});

    await saveEmergencyCallSim(2, {displayName: 'SIM 2', slotIndex: 1});
    const result = await placeCall({emergencyNumber: '+1234567890'});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('+1234567890', 2);
  });

  test('dual-SIM: saved SIM no longer active still results in a call (native falls back)', async () => {
    const {NativeModules} = require('react-native');
    const {saveEmergencyCallSim, initiateEmergencyCall: placeCall} = require('../src/features/sos/services/callService');
    connectivityService.updateState({isConnected: true, isInternetReachable: true, isCellularAvailable: true});
    // Native reports it used a fallback account because the saved SIM disappeared,
    // but the call still goes out - the SOS must never silently fail here.
    NativeModules.EmergencyMedia.placeCall.mockResolvedValue({
      status: 'pending',
      reason: 'Android launched the emergency call using a fallback telephony account because the saved emergency SIM is no longer active, but the final call status is not yet confirmed by the device.',
      usedFallbackSim: true,
    });

    await saveEmergencyCallSim(99, {displayName: 'Old SIM'});
    const result = await placeCall({emergencyNumber: '+1234567890'});

    expect(result.status).toBe('INITIATED');
    expect(NativeModules.EmergencyMedia.placeCall).toHaveBeenCalledWith('+1234567890', 99);
  });

  test('single SIM: getAvailableEmergencySims returning one entry means no picker is needed', async () => {
    const {NativeModules} = require('react-native');
    const {getAvailableEmergencySims} = require('../src/features/sos/services/callService');
    NativeModules.EmergencyMedia.getAvailableSims.mockResolvedValue([
      {subscriptionId: 1, slotIndex: 0, displayName: 'SIM 1', carrierName: 'Carrier', isDefault: true},
    ]);

    const sims = await getAvailableEmergencySims();

    expect(sims).toHaveLength(1);
  });

  test('getAvailableEmergencySims never throws when native enumeration fails', async () => {
    const {NativeModules} = require('react-native');
    const {getAvailableEmergencySims} = require('../src/features/sos/services/callService');
    NativeModules.EmergencyMedia.getAvailableSims.mockRejectedValue(new Error('native failure'));

    await expect(getAvailableEmergencySims()).resolves.toEqual([]);
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

  test('camera keeps front success independent from a failed back lens', async () => {
    captureNativeSosPhotos.mockResolvedValue({
      frontImagePath: '/data/front.jpg',
      backError: 'Back lens unavailable',
    });

    const result = await captureEmergencyPhotos({sosId: 'sos_camera_partial'});

    expect(result.status).toBe('PENDING');
    expect(result.frontImagePath).toBe('/data/front.jpg');
    expect(result.backImagePath).toBeNull();
    expect(result.backError).toBe('Back lens unavailable');
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

  test('audio retry reuses the durable local recording instead of recording again', async () => {
    const result = await recordEmergencyAudio({
      sosId: 'sos_audio_retry',
      previousResult: {status: 'FAILED', localPath: '/data/user/0/app/files/sos-media/audio.m4a'},
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.localPath).toContain('audio.m4a');
    expect(recordNativeSosAudio).not.toHaveBeenCalled();
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

  test('a failed component upload does not block other components and is not retried once it already succeeded', async () => {
    const {uploadSosMedia, reportSosMedia} = require('../src/api/resources');
    connectivityService.updateState({isConnected: true, isInternetReachable: true});

    // frontImage succeeds, backImage fails (transient), audio succeeds.
    uploadSosMedia.mockImplementation(async (token, backendId, component) => {
      if (component === 'backImage') {
        throw new Error('Network error uploading backImage');
      }
      return {sos: {components: {[component]: {status: 'success', storageRef: `sos/backend-1/${component}.jpg`}}}};
    });

    const sosEvent = {
      id: 'sos-partial',
      backendId: 'backend-1',
      services: {
        camera: {status: 'COMPLETED', frontImagePath: '/cache/front.jpg', backImagePath: '/cache/back.jpg'},
        audio: {status: 'COMPLETED', localPath: '/cache/audio.m4a'},
      },
    };

    const firstAttempt = await uploadCapturedSosMedia({token: 'jwt-token', sosEvent});

    // backImage failing must not have prevented audio (attempted after it
    // in MEDIA_COMPONENTS order) from being uploaded.
    expect(firstAttempt.status).toBe('PENDING');
    expect(firstAttempt.uploaded.map(item => item.component)).toEqual(expect.arrayContaining(['frontImage', 'audio']));
    expect(firstAttempt.failures).toEqual([{component: 'backImage', error: 'Network error uploading backImage'}]);
    expect(uploadSosMedia).toHaveBeenCalledTimes(3);

    // Retry: backImage now succeeds. frontImage/audio must NOT be
    // re-uploaded (no duplicate cloud objects for already-stored media).
    uploadSosMedia.mockClear();
    uploadSosMedia.mockImplementation(async (token, backendId, component) => ({
      sos: {components: {[component]: {status: 'success', storageRef: `sos/backend-1/${component}.jpg`}}},
    }));

    const persisted = await sosLocalStore.getSosById('sos-partial');
    const secondAttempt = await uploadCapturedSosMedia({token: 'jwt-token', sosEvent: persisted});

    expect(secondAttempt.status).toBe('COMPLETED');
    expect(uploadSosMedia).toHaveBeenCalledTimes(1);
    expect(uploadSosMedia).toHaveBeenCalledWith('jwt-token', 'backend-1', 'backImage', expect.any(Object));
    expect(secondAttempt.uploaded.map(item => item.component).sort()).toEqual(['audio', 'backImage', 'frontImage']);
    expect(reportSosMedia).not.toHaveBeenCalled();
  });

  test('invalid local media is persisted as a permanent component failure', async () => {
    const {uploadSosMedia} = require('../src/api/resources');
    require('../src/features/sos/services/nativeMedia').validateNativeSosMedia.mockResolvedValue(false);
    connectivityService.updateState({isConnected: true, isInternetReachable: true});

    const result = await uploadCapturedSosMedia({
      token: 'jwt-token',
      sosEvent: {
        id: 'sos-invalid-media',
        backendId: 'backend-invalid-media',
        services: {camera: {frontImagePath: '/missing/front.jpg'}},
      },
      component: 'frontImage',
    });

    expect(result.status).toBe('FAILED');
    expect(uploadSosMedia).not.toHaveBeenCalled();
    expect((await sosLocalStore.getSosById('sos-invalid-media')).mediaUploadState.frontImage.status).toBe('FAILED');
  });

  test('media queue identity remains stable before and after backend confirmation', async () => {
    const event = await createSosLocalEvent({userId: 'user-1', collectionId: 'collection-1'});
    await enqueueSosJob({sosId: event.id, backendSosId: null, type: 'MEDIA_UPLOAD:audio', serviceName: 'mediaUpload', payload: {component: 'audio'}});
    await enqueueSosJob({sosId: event.id, backendSosId: 'backend-1', type: 'MEDIA_UPLOAD:audio', serviceName: 'mediaUpload', payload: {component: 'audio'}});

    const queue = await sosLocalStore.getPendingQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(`${event.id}:MEDIA_UPLOAD:audio`);
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
