import Geolocation from '@react-native-community/geolocation';

export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position?.coords?.latitude ?? null,
          longitude: position?.coords?.longitude ?? null,
          accuracy: position?.coords?.accuracy ?? null,
          capturedAt: new Date().toISOString(),
        });
      },
      (error) => {
        reject(new Error(error?.message || 'Location capture failed.'));
      },
      {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 60000,
      }
    );
  });
}

export default { getCurrentLocation };
