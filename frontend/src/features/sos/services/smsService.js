import {NativeModules, Platform} from 'react-native';
import {connectivityService, getConnectivityState} from '../connectivity';
import {sosLocalStore} from '../storage';

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
          deliveryStatus: 'QUEUED_TO_ANDROID',
        };
      }

      if (normalizedStatus === 'UNSUPPORTED' || /SIM|subscription|carrier|device|SMS application/i.test(String(result?.reason || ''))) {
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
      status: /permission|module|capability|unsupported|no Android SMS|No SMS application|SMS application unavailable/i.test(error?.message || '')
        ? 'UNSUPPORTED'
        : 'FAILED',
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
 *  - 'PENDING' if any number remains retryable (queued, temporarily failed,
 *    or cellular unavailable) — the whole batch gets retried together.
 *  - 'UNSUPPORTED' only if every number came back unsupported (no native
 *    SMS capability at all).
 *  - 'NOT_CONFIGURED' if there were no valid numbers to send to.
 */
export async function sendEmergencySmsToNumbers({phoneNumbers, message, sosId}) {
  const uniqueNumbers = [];
  const seenNumbers = new Set();
  for (const value of phoneNumbers || []) {
    const phoneNumber = String(value || '').trim();
    const normalizedRecipient = phoneNumber.replace(/[^\d+]/g, '');
    if (phoneNumber && normalizedRecipient && !seenNumbers.has(normalizedRecipient)) {
      seenNumbers.add(normalizedRecipient);
      uniqueNumbers.push(phoneNumber);
    }
  }

  if (__DEV__) console.log('SMS_STARTED', {recipientCount: uniqueNumbers.length});

  if (uniqueNumbers.length === 0) {
    return {
      status: 'NOT_CONFIGURED',
      reason: 'No emergency SMS numbers are configured for this collection.',
      recipients: [],
    };
  }

  if (__DEV__) console.log('SMS_RECIPIENTS_FOUND', uniqueNumbers.length);

  const event = sosId ? await sosLocalStore.getSosById(sosId) : null;
  const previousRecipients = event?.services?.sms?.recipients || [];
  const previousByNumber = new Map(previousRecipients.map(item => [item.normalizedRecipient || item.phoneNumber, item]));
  const recipientResults = [];

  for (const phoneNumber of uniqueNumbers) {
    const normalizedRecipient = phoneNumber.replace(/[^\d+]/g, '');
    const previous = previousByNumber.get(normalizedRecipient);
    if (previous?.status === 'QUEUED_TO_ANDROID' || previous?.status === 'SENT_BROADCAST' || previous?.status === 'DELIVERED_BROADCAST') {
      recipientResults.push(previous);
      continue;
    }

    const attempt = (previous?.attempts || 0) + 1;
    const attemptedAt = new Date().toISOString();
    const result = await sendEmergencySms({phoneNumber, message});
    const recipientResult = {
      recipient: phoneNumber,
      phoneNumber,
      normalizedRecipient,
      status: result.status === 'COMPLETED' ? 'QUEUED_TO_ANDROID' : result.status === 'PENDING' ? 'RETRY_WAITING' : result.status,
      attempts: attempt,
      lastError: result.status === 'COMPLETED' ? null : (result.reason || null),
      lastAttemptAt: attemptedAt,
      nextAttemptAt: result.status === 'PENDING' || result.status === 'FAILED' ? null : null,
      reason: result.reason || null,
      deliveryStatus: result.deliveryStatus || null,
      subscriptionId: result.subscriptionId || null,
    };
    recipientResults.push(recipientResult);

    if (sosId) {
      const latestEvent = await sosLocalStore.getSosById(sosId);
      if (latestEvent) {
        await sosLocalStore.updateSosServiceState(sosId, 'sms', {
          recipients: [
            ...(latestEvent.services?.sms?.recipients || []).filter(item => item.normalizedRecipient !== normalizedRecipient),
            ...recipientResults.filter(item => item.normalizedRecipient === normalizedRecipient),
          ],
        });
      }
    }
  }

  const results = recipientResults;

  const sentCount = results.filter(r => ['QUEUED_TO_ANDROID', 'SENT_BROADCAST', 'DELIVERED_BROADCAST'].includes(r.status)).length;
  const failedCount = results.filter(r => r.status === 'UNSUPPORTED' || r.status === 'FAILED').length;
  const pendingCount = results.filter(r => r.status === 'RETRY_WAITING').length;

  if (__DEV__) {
    console.log('SMS_SENT', sentCount);
    console.log('SMS_FAILED', failedCount);
  }

  let status;
  if (pendingCount > 0 || failedCount > 0) {
    status = 'PENDING';
  } else if (sentCount > 0) {
    status = 'COMPLETED';
  } else {
    status = 'UNSUPPORTED';
  }

  return {
    status,
    reason: `${sentCount}/${uniqueNumbers.length} emergency SMS delivered.`,
    recipients: results,
    recipientStates: results,
    sentCount,
    failedCount,
    pendingCount,
  };
}

export default {sendEmergencySms, sendEmergencySmsToNumbers};