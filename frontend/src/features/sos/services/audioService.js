export async function recordEmergencyAudio({sosId}) {
  if (!sosId) {
    throw new Error('Audio capture requires a local SOS identifier.');
  }

  throw new Error('Audio recording is not available in this app build.');
}

export default { recordEmergencyAudio };
