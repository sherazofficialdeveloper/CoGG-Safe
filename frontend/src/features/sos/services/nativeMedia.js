// nativeMedia.js - FIXED
import { NativeModules, Platform } from 'react-native';

const nativeMedia = NativeModules?.EmergencyMedia;

function requireAndroidModule() {
  if (Platform.OS !== 'android' || !nativeMedia) {
    throw new Error('Native SOS media capture is unavailable on this device.');
  }
  return nativeMedia;
}

export const captureNativeSosPhotos = (sosId, captureFront = true, captureBack = true) =>
  requireAndroidModule().capturePhotos(sosId, captureFront, captureBack);

export const recordNativeSosAudio = (sosId, durationMs) =>
  requireAndroidModule().recordAudio(sosId, durationMs);

export const validateNativeSosMedia = localPath => {
  const module = requireAndroidModule();
  if (typeof module.validateMediaFile !== 'function') return true;
  return module.validateMediaFile(localPath);
};

export const getNativeCurrentLocation = async () => {
  const module = requireAndroidModule();
  if (typeof module.getCurrentLocation !== 'function') return null;
  return module.getCurrentLocation();
};

// ================= FIX: downloadAuthenticatedMedia =================
export const downloadAuthenticatedSosMedia = async (url, token) => {
  console.log('[NativeMedia] Download called');
  
  // If no token, can't download private media
  if (!token || token.trim().length === 0) {
    console.log('[NativeMedia] No token provided');
    throw new Error('Authentication required');
  }

  try {
    const module = requireAndroidModule();
    
    if (typeof module.downloadAuthenticatedMedia === 'function') {
      console.log('[NativeMedia] Using native download method');
      const path = await module.downloadAuthenticatedMedia(url, token);
      
      // ================= FIX: Check if path is a valid local file =================
      if (path && typeof path === 'string' && path.length > 0) {
        // Check if it's a local file path (not a URL)
        const isLocalFile = !path.startsWith('http://') && !path.startsWith('https://');
        if (isLocalFile) {
          console.log('[NativeMedia] Native download success:', path);
          return path;
        } else {
          console.log('[NativeMedia] Native download returned URL, not local file');
          throw new Error('Download did not return a local file');
        }
      }
    }
    
    console.log('[NativeMedia] Native download not available');
    throw new Error('Native download not available');
  } catch (err) {
    console.log('[NativeMedia] Download error:', err);
    throw err;
  }
};