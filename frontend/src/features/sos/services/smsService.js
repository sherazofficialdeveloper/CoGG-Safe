import {NativeModules, Platform} from 'react-native';
import {connectivityService, getConnectivityState} from '../connectivity';

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'SMS is only supported on Android devices.'};
  }

  // SMS availability is about the SIM/cellular radio, not about which
  // interface (Wi-Fi or cellular) currently carries internet traffic, and
  // it can change between periodic background checks. Refresh right before
  // this trigger-critical decision; this is a local device check, never a
  // network call, so it cannot delay the SMS.
  await connectivityService.refreshTelephonyState().catch(() => undefined);

  const connectivity = getConnectivityState();
  const cellularAvailable = Boolean(connectivity.isCellularAvailable);
  if (!cellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service is unavailable; emergency SMS is queued for retry.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia) {
    return {
      status: 'UNSUPPORTED',
      reason: 'The native SMS module is unavailable on this device.',
    };
  }

  try {
    if (typeof emergencyMedia.sendEmergencySms === 'function') {
      const result = await emergencyMedia.sendEmergencySms(
        phoneNumber,
        message || 'Emergency assistance requested.',
      );

      const normalizedStatus = String(result?.status || '').toUpperCase();
      if (normalizedStatus === 'SENT' || normalizedStatus === 'COMPLETED') {
        return {
          status: 'COMPLETED',
          reason: result?.reason || 'SMS sent via carrier network.',
          subscriptionId: result?.subscriptionId || null,
        };
      }

      if (normalizedStatus === 'UNSUPPORTED' || /SIM|subscription|carrier|device/i.test(String(result?.reason || ''))) {
        return {
          status: 'UNSUPPORTED',
          reason: result?.reason || 'SMS capability unavailable on this device.',
        };
      }
    }

    if (typeof emergencyMedia.openSmsComposer === 'function') {
      const result = await emergencyMedia.openSmsComposer(
        phoneNumber,
        message || 'Emergency assistance requested.',
      );

      if (String(result?.status || '').toUpperCase() === 'UNSUPPORTED') {
        return {
          status: 'UNSUPPORTED',
          reason: result?.reason || 'No Android SMS application is available.',
        };
      }

      return {
        status: 'PENDING',
        reason: result?.reason || 'Android opened the system SMS composer. User confirmation is required.',
      };
    }

    return {
      status: 'UNSUPPORTED',
      reason: 'No SMS method is available on this device.',
    };
  } catch (error) {
    return {
      status: 'UNSUPPORTED',
      reason: error?.message || 'Android could not send the SMS.',
    };
  }
}

/**
 * Sends the emergency SMS to EVERY valid number belonging to the SOS
 * collection (not just the single collection.emergencyCallNumber). Each
 * recipient is attempted independently via sendEmergencySms — one number
 * failing (bad number, no SIM route, etc.) never stops the others. Duplicate
 * numbers are removed first (e.g. the same number configured as both the
 * collection's primary emergency number and a member's own mobile number).
 *
 * Returns an aggregate status for the existing single-status service
 * contract (event.services.sms.status, used by orchestrator/queueWorker's
 * retry logic and the backend's single `sms` component), plus a per-number
 * `recipients` breakdown for on-device display:
 *  - 'COMPLETED' if at least one number received the SMS.
 *  - 'PENDING' if none succeeded yet but at least one is retryable
 *    (queued/cellular unavailable) — the whole batch gets retried together.
 *  - 'UNSUPPORTED' only if every number came back unsupported (no native
 *    SMS capability at all).
 *  - 'NOT_CONFIGURED' if there were no valid numbers to send to.
 */
export async function sendEmergencySmsToNumbers({phoneNumbers, message}) {
  const uniqueNumbers = Array.from(
    new Set((phoneNumbers || []).map(n => String(n || '').trim()).filter(Boolean)),
  );

  if (__DEV__) console.log('SMS_STARTED', {recipientCount: uniqueNumbers.length});

  if (uniqueNumbers.length === 0) {
    return {
      status: 'NOT_CONFIGURED',
      reason: 'No emergency SMS numbers are configured for this collection.',
      recipients: [],
    };
  }

  if (__DEV__) console.log('SMS_RECIPIENTS_FOUND', uniqueNumbers.length);

  const results = await Promise.all(
    uniqueNumbers.map(async phoneNumber => {
      const result = await sendEmergencySms({phoneNumber, message});
      return {phoneNumber, ...result};
    }),
  );

  const sentCount = results.filter(r => r.status === 'COMPLETED').length;
  const failedCount = results.filter(r => r.status === 'UNSUPPORTED' || r.status === 'FAILED').length;
  const pendingCount = results.filter(r => r.status === 'PENDING').length;

  if (__DEV__) {
    console.log('SMS_SENT', sentCount);
    console.log('SMS_FAILED', failedCount);
  }

  let status;
  if (sentCount > 0) {
    status = 'COMPLETED';
  } else if (pendingCount > 0) {
    status = 'PENDING';
  } else {
    status = 'UNSUPPORTED';
  }

  return {
    status,
    reason: `${sentCount}/${uniqueNumbers.length} emergency SMS delivered.`,
    recipients: results,
    sentCount,
    failedCount,
    pendingCount,
  };
}

export default {sendEmergencySms, sendEmergencySmsToNumbers};