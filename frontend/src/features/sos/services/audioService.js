import {PermissionsAndroid, Platform} from 'react-native';
import {recordNativeSosAudio} from './nativeMedia';

export async function recordEmergencyAudio({sosId}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }

  if (Platform.OS !== 'android') {
    return {status: 'FAILED', localPath: null, error: 'Audio capture is only supported on Android.'};
  }

  const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  const deniedStates = [false, PermissionsAndroid.RESULTS.DENIED, PermissionsAndroid.RESULTS.BLOCKED, PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN];
  if (deniedStates.includes(hasPermission)) {
    return {status: 'FAILED', localPath: null, error: 'Microphone permission denied'};
  }

  try {
    const localPath = await recordNativeSosAudio(sosId, 5000);
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
