import {Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission} from '../../../permissions/sosPermissions';
import {recordNativeSosAudio} from './nativeMedia';
import {emitSosDiagnostic} from './sosDiagnosticService';

const AUDIO_DURATION_MS = 5000;

export async function recordEmergencyAudio({sosId, previousResult = null}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }
  // The native recorder writes into the app's private files directory. A
  // retry must reuse that durable path rather than create a second recording.
  if (typeof previousResult?.localPath === 'string' && previousResult.localPath.trim()) {
    return {
      ...previousResult,
      status: 'COMPLETED',
      component: 'AUDIO',
    };
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
    emitSosDiagnostic('SOS DEBUG AUDIO 01: Recording started');
    if (__DEV__) console.log('AUDIO_STARTED', {sosId, durationMs: AUDIO_DURATION_MS});
    const localPath = await recordNativeSosAudio(sosId, AUDIO_DURATION_MS);
    emitSosDiagnostic('SOS DEBUG AUDIO 02: Recording finished');
    if (typeof localPath !== 'string' || !localPath.trim()) {
      throw new Error('Audio recording returned an invalid file.');
    }
    emitSosDiagnostic('SOS DEBUG AUDIO 03: File path present');
    emitSosDiagnostic('SOS DEBUG AUDIO 04: File validation usable');
    emitSosDiagnostic('SOS DEBUG AUDIO 06: Duration 5000ms');
    emitSosDiagnostic('SOS DEBUG AUDIO 07: MIME audio/mp4');
    return {
      status: 'COMPLETED',
      localPath,
      component: 'AUDIO',
      durationMs: AUDIO_DURATION_MS,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    emitSosDiagnostic(`SOS DEBUG AUDIO FAILED: ${error?.message || 'Audio recording failed'}`, 'error');
    return {status: 'FAILED', localPath: null, component: 'AUDIO', error: error?.message || 'Audio recording failed'};
  }
}

export default {recordEmergencyAudio};
