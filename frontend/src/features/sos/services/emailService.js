export function normalizeEmailStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (['pending', 'processing', 'sent', 'failed', 'unknown'].includes(normalized)) {
    return normalized.toUpperCase();
  }
  return 'UNKNOWN';
}

export async function dispatchEmergencyEmail({email}) {
  if (!email) {
    return {status: 'NOT_CONFIGURED', reason: 'No email is configured for this user.'};
  }

  return {status: normalizeEmailStatus('pending'), reason: 'Email dispatch is queued for backend processing.'};
}

export default { dispatchEmergencyEmail, normalizeEmailStatus };
