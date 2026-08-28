import {PermissionsAndroid, Platform} from 'react-native';
import {recordNativeSosAudio} from './nativeMedia';

export const SOS_AUDIO_DURATION_MS = 5000;

function normalizePermissionResult(status) {
  if (typeof status === 'string') {
    return status.toLowerCase() === 'granted';
  }
  return Boolean(status);
}

function describePermissionFailure(status) {
  if (!status) return 'Microphone permission denied';
  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    return 'Microphone permission is blocked. Open device settings to allow access.';
  }
  if (status === PermissionsAndroid.RESULTS.BLOCKED) {
    return 'Microphone permission is blocked by the device.';
  }
  return `Microphone permission ${status}`;
}

export async function checkAudioPermission() {
  if (Platform.OS !== 'android') return false;
  const status = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  return normalizePermissionResult(status);
}

export async function requestAudioPermission() {
  if (Platform.OS !== 'android') {
    return {granted: false, status: 'unavailable', reason: 'Microphone capture is unavailable on this platform.'};
  }

  const current = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  if (normalizePermissionResult(current)) {
    return {granted: true, status: PermissionsAndroid.RESULTS.GRANTED, reason: null};
  }

  const status = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const granted = normalizePermissionResult(status);

  return {
    granted,
    status,
    reason: granted ? null : describePermissionFailure(status),
  };
}

export async function recordEmergencyAudio({sosId}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }

  const permission = await requestAudioPermission();
  if (!permission.granted) {
    return {status: 'FAILED', localPath: null, error: permission.reason || 'Microphone permission denied'};
  }

  let localPath;
  try {
    localPath = await recordNativeSosAudio(sosId, SOS_AUDIO_DURATION_MS);
  } catch (error) {
    return {
      status: 'FAILED',
      localPath: null,
      error: error?.message || 'Audio recording failed.',
    };
  }

  if (!localPath) {
    return {status: 'FAILED', localPath: null, error: 'Audio recording failed.'};
  }

  return {
    status: 'COMPLETED',
    localPath,
    completedAt: new Date().toISOString(),
  };
}

export default {recordEmergencyAudio, checkAudioPermission, requestAudioPermission};
