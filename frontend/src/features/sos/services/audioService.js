import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission} from '../../../permissions/sosPermissions';
import {recordNativeSosAudio} from './nativeMedia';

const AUDIO_DURATION_MS = 5000;

export async function recordEmergencyAudio({sosId}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }
  if (Platform.OS !== 'android') {
    return {status: 'FAILED', localPath: null, component: 'AUDIO', error: 'Audio capture is only supported on Android.'};
  }
  const permissionState = await checkPermission('android.permission.RECORD_AUDIO');
  if (permissionState !== PERMISSION_STATUS.GRANTED) {
    return {
      status: 'FAILED',
      localPath: null,
      component: 'AUDIO',
      error: permissionState === PERMISSION_STATUS.BLOCKED ? 'Microphone permission is blocked' : 'Microphone permission denied',
    };
  }
  try {
    if (__DEV__) console.log('AUDIO_STARTED', {sosId, durationMs: AUDIO_DURATION_MS});
    const localPath = await recordNativeSosAudio(sosId, AUDIO_DURATION_MS);
    if (typeof localPath !== 'string' || !localPath.trim()) {
      throw new Error('Audio recording returned an invalid file.');
    }
    return {
      status: 'COMPLETED',
      localPath,
      component: 'AUDIO',
      durationMs: AUDIO_DURATION_MS,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {status: 'FAILED', localPath: null, component: 'AUDIO', error: error?.message || 'Audio recording failed'};
  }
}

export default {recordEmergencyAudio};
