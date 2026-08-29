export async function captureEmergencyPhotos({sosId}) {
  if (!sosId) {
    throw new Error('Camera capture requires a local SOS identifier.');
  }

  throw new Error('Camera capture is not available in this app build.');
}

export default { captureEmergencyPhotos };
