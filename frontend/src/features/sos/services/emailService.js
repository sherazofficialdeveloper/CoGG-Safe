export async function dispatchEmergencyEmail({email}) {
  if (!email) {
    return {status: 'NOT_CONFIGURED', reason: 'No email is configured for this user.'};
  }

  return {status: 'PENDING', reason: 'Email dispatch is queued for backend processing.'};
}

export default { dispatchEmergencyEmail };
