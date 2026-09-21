export async function dispatchEmergencyNotifications({sosId}) {
  if (!sosId) {
    throw new Error('Notification dispatch requires a local SOS identifier.');
  }

  return {
    status: 'PENDING',
    reason: 'Real device push delivery is not configured in this app build. Backend notification records are created, but no FCM delivery can be claimed until Firebase credentials and Android config are supplied.',
  };
}

export default { dispatchEmergencyNotifications };
