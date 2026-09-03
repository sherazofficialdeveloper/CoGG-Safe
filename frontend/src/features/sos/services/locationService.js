import Geolocation from '@react-native-community/geolocation';

export async function getCurrentLocation() {
  if (__DEV__) console.log('LOCATION_CAPTURE_STARTED');

  if (!Geolocation || typeof Geolocation.getCurrentPosition !== 'function') {
    throw new Error('Location services are not available on this device.');
  }

  return new Promise((resolve, reject) => {
    let timedOut = false;

    // Timeout after 10 seconds to not block SOS flow
    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      reject(new Error('Location acquisition timed out (10 seconds).'));
    }, 10000);

    Geolocation.getCurrentPosition(
      (position) => {
        if (!timedOut) {
          clearTimeout(timeoutHandle);
          const result = {
            latitude: position?.coords?.latitude ?? null,
            longitude: position?.coords?.longitude ?? null,
            accuracy: position?.coords?.accuracy ?? null,
            capturedAt: new Date().toISOString(),
          };
          if (__DEV__) console.log('LOCATION_CAPTURE_SUCCESS', result);
          resolve(result);
        }
      },
      (error) => {
        if (!timedOut) {
          clearTimeout(timeoutHandle);
          reject(new Error(error?.message || 'Location capture failed.'));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  });
}

export default { getCurrentLocation };
