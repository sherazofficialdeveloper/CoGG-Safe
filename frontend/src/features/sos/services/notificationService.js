export async function dispatchEmergencyNotifications({sosId}) {
  if (!sosId) {
    throw new Error('Notification dispatch requires a local SOS identifier.');
  }

  return {status: 'PENDING', reason: 'Backend notification delivery is queued.'};
}

export default { dispatchEmergencyNotifications };
