export async function getCurrentLocation() {
  const geolocation = globalThis.navigator && globalThis.navigator.geolocation;

  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    throw new Error('Location services are not available on this device.');
  }

  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
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
