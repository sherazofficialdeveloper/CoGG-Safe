import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission} from '../../../permissions/sosPermissions';
import {recordNativeSosAudio} from './nativeMedia';

export async function recordEmergencyAudio({sosId}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }

  if (Platform.OS !== 'android') {
    return {status: 'FAILED', localPath: null, error: 'Audio capture is only supported on Android.'};
  }

  const permissionState = await checkPermission('android.permission.RECORD_AUDIO');
  if (permissionState !== PERMISSION_STATUS.GRANTED) {
    return {status: 'FAILED', localPath: null, error: permissionState === PERMISSION_STATUS.BLOCKED ? 'Microphone permission is blocked' : 'Microphone permission denied'};
  }

  try {
    if (__DEV__) console.log('AUDIO_STARTED', {sosId});
    const localPath = await recordNativeSosAudio(sosId, 5000);
    if (__DEV__) console.log('AUDIO_COMPLETED', {sosId, localPath});
    return {
      status: 'COMPLETED',
      localPath,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'FAILED',
      localPath: null,
      error: error?.message || 'Audio recording failed',
    };
  }
}

export default { recordEmergencyAudio };
