import {NativeModules, Platform} from 'react-native';
import {emitSosDiagnostic} from './sosDiagnosticService';

const nativeMedia = NativeModules?.EmergencyMedia;

function requireAndroidModule() {
  if (Platform.OS !== 'android' || !nativeMedia) {
    throw new Error('Native SOS media capture is unavailable on this device.');
  }
  return nativeMedia;
}

export const captureNativeSosPhotos = sosId => requireAndroidModule().capturePhotos(sosId);
export const recordNativeSosAudio = (sosId, durationMs) => requireAndroidModule().recordAudio(sosId, durationMs);
export const validateNativeSosMedia = localPath => {
  const module = requireAndroidModule();
  if (typeof module.validateMediaFile !== 'function') return true;
  return module.validateMediaFile(localPath);
};
export const downloadAuthenticatedSosMedia = async (url, token) => {
  emitSosDiagnostic('SOS DEBUG MEDIA GET START');
  try {
    const path = await requireAndroidModule().downloadAuthenticatedMedia(url, token);
    emitSosDiagnostic('SOS DEBUG MEDIA GET SUCCESS');
    return path;
  } catch (error) {
    emitSosDiagnostic(`SOS DEBUG MEDIA GET FAILED: ${error?.message || 'download failed'}`, 'error');
    throw error;
  }
};
