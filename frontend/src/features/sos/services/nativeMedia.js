import {NativeModules, Platform} from 'react-native';

const nativeMedia = NativeModules?.EmergencyMedia;

function requireAndroidModule() {
  if (Platform.OS !== 'android' || !nativeMedia) {
    throw new Error('Native SOS media capture is unavailable on this device.');
  }
  return nativeMedia;
}

export const captureNativeSosPhotos = sosId => requireAndroidModule().capturePhotos(sosId);
export const recordNativeSosAudio = (sosId, durationMs) => requireAndroidModule().recordAudio(sosId, durationMs);
