// src/features/sos/services/smsService.js

import {Alert, NativeModules, Platform} from 'react-native';
import {PERMISSION_STATUS, checkPermission, requestPermission, openSmsPermissionSettings, checkSmsPermission, getActiveSimCount, getDefaultSimId} from '../../../permissions/sosPermissions';
import {sosLocalStore} from '../storage';
import {emitSosDiagnostic, ensureSosNativeDiagnosticListener} from './sosDiagnosticService';

export async function sendEmergencySms({phoneNumber, message, preferredSubscriptionId = null}) {
  ensureSosNativeDiagnosticListener();
  emitSosDiagnostic('SMS DEBUG — Service reached');
  if (__DEV__) console.log('[SOS][SMS] RUNNER_STARTED', {hasRecipient: Boolean(phoneNumber)});
  if (!phoneNumber) {
    emitSosDiagnostic('SMS ERROR — No valid recipient', 'error');
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  emitSosDiagnostic('SMS DEBUG — Recipient found');

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'SMS is only supported on Android devices.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia) {
    return {
      status: 'UNSUPPORTED',
      reason: 'The native SMS module is unavailable on this device.',
    };
  }

  try {
    // ================= FIX: Check SMS permission =================
    let permissionState = await checkSmsPermission();
    
    if (__DEV__) console.log('[SOS_DEBUG] SMS_PERMISSION_STATE', {state: permissionState});
    
    // SEND_SMS is a hard-restricted permission on current Android releases.
    // A runtime request can only succeed when the installer/distribution path
    // has legitimately allowlisted the permission. Always verify the real
    // Android state; never assume Android 13+ denial means Settings can grant it.
    if (permissionState === PERMISSION_STATUS.DENIED) {
      permissionState = await requestPermission('android.permission.SEND_SMS');
      // Verify the result after Android handles the request.
      permissionState = await checkSmsPermission();
    }

    if (permissionState === PERMISSION_STATUS.BLOCKED) {
      return new Promise((resolve) => {
        Alert.alert(
          'SMS Permission Restricted',
          'Android is blocking direct SMS for this installation. If this build was installed outside Google Play, test the signed Play release after the SEND_SMS use case has been approved by Google Play.',
          [
            {text: 'Cancel', style: 'cancel', onPress: () => resolve({
              status: 'PENDING',
              reason: 'SMS permission is restricted by Android.',
            })},
            {text: 'Open Settings', onPress: async () => {
              await openSmsPermissionSettings();
              resolve({
                status: 'PENDING',
                reason: 'Please review the Android app permission state.',
              });
            }},
          ],
        );
      });
    }

    const permissionGranted = permissionState === PERMISSION_STATUS.GRANTED;
    emitSosDiagnostic(permissionGranted ? 'SMS DEBUG — SEND_SMS permission granted' : 'SMS ERROR — SEND_SMS permission denied', permissionGranted ? 'info' : 'error');
    
    if (!permissionGranted) {
      // Direct SMS is intentionally unavailable until Android reports SEND_SMS
      // as actually granted. Never open an SMS composer as a fallback.
      return {
        status: permissionState === PERMISSION_STATUS.BLOCKED ? 'UNSUPPORTED' : 'PENDING',
        reason: permissionState === PERMISSION_STATUS.BLOCKED
          ? 'Android has not granted SEND_SMS for this installation.'
          : 'SEND_SMS permission was not granted; direct SMS was not sent.',
      };
    }
    
    // ================= Continue with SMS sending =================
    if (typeof emergencyMedia.sendEmergencySms === 'function') {
      if (__DEV__) console.log('[SOS][SMS] SERVICE_INVOKED', {nativeMethod: 'EmergencyMedia.sendEmergencySms'});
      emitSosDiagnostic('SMS DEBUG — Native SMS method invoked');
      if (__DEV__) console.log('[SOS][SMS] ATTEMPT_NATIVE', {recipient: `${phoneNumber.slice(0, 3)}***`});
      
      // Native Android selects physical SIM 1 (slot 0), or SIM 2 (slot 1)
      // when SIM 1 is unavailable. No chooser and no saved SIM preference is used.
      const selectedSubscriptionId = -1;

      const result = await emergencyMedia.sendEmergencySms(
        phoneNumber,
        message || 'Emergency assistance requested.',
        selectedSubscriptionId,
      );
      if (__DEV__) console.log('[SOS_DEBUG] SMS_SEND_ATTEMPT', {recipient: `${phoneNumber.slice(0, 3)}***`});
      if (__DEV__) console.log('[SOS_DEBUG] SMS_SEND_RESULT', {
        status: result?.status || null,
        subscriptionId: result?.subscriptionId || null,
        reason: result?.reason || null,
      });

      const normalizedStatus = String(result?.status || '').toUpperCase();
      if (normalizedStatus === 'SENT' || normalizedStatus === 'COMPLETED') {
        if (__DEV__) console.log('[SOS][SMS] NATIVE_ACCEPTED', {recipient: `${phoneNumber.slice(0, 3)}***`});
        emitSosDiagnostic('SMS SUCCESS — SMS send request accepted', 'success');
        return {
          status: 'COMPLETED',
          reason: result?.reason || 'SMS sent via carrier network.',
          subscriptionId: result?.subscriptionId || null,
          deliveryStatus: 'QUEUED_TO_ANDROID',
        };
      }

      if (normalizedStatus === 'UNSUPPORTED' || /SIM|subscription|carrier|device|SMS application/i.test(String(result?.reason || ''))) {
        if (__DEV__) console.log('[SOS][SMS] FAILED', {reason: result?.reason || 'SMS unsupported'});
        emitSosDiagnostic('SMS ERROR — ' + (result?.reason || 'SMS capability unavailable on this device.'), 'error');
        return {
          status: 'UNSUPPORTED',
          reason: result?.reason || 'SMS capability unavailable on this device.',
        };
      }
    }

    return {
      status: 'UNSUPPORTED',
      reason: 'Direct Android SMS sending is unavailable on this device.',
    };
  } catch (error) {
    if (__DEV__) console.log('[SOS_DEBUG] SMS_SEND_ERROR', {message: error?.message || 'unknown'});
    emitSosDiagnostic('SMS ERROR — ' + (error?.message || 'Android could not send the SMS.'), 'error');
    if (__DEV__) console.log('[SOS][SMS] FAILED', {reason: error?.message || 'Android could not send the SMS.'});
    return {
      status: /permission|module|capability|unsupported|no Android SMS|No SMS application|SMS application unavailable/i.test(error?.message || '')
        ? 'UNSUPPORTED'
        : 'FAILED',
      reason: error?.message || 'Android could not send the SMS.',
    };
  }
}

export {openSmsPermissionSettings};

export async function chooseSmsSubscription() {
  if (Platform.OS !== 'android') return -1;
  const module = NativeModules?.EmergencyMedia;
  if (!module || typeof module.getAvailableSims !== 'function') return -1;
  try {
    const rawSims = await module.getAvailableSims();
    const sims = Array.isArray(rawSims) ? rawSims.slice().sort((a, b) => Number(a?.slotIndex ?? 99) - Number(b?.slotIndex ?? 99)) : [];
    const selected = sims.find(sim => Number(sim?.slotIndex) === 0) || sims.find(sim => Number(sim?.slotIndex) === 1) || sims[0];
    const id = Number(selected?.subscriptionId);
    return Number.isInteger(id) && id >= 0 ? id : -1;
  } catch (_) {
    return -1;
  }
}

export async function sendEmergencySmsToNumbers({phoneNumbers, message, sosId, serviceKey = 'sms', preferredSubscriptionId = null}) {
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
  const previousRecipients = event?.services?.[serviceKey]?.recipients || [];
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
    const result = await sendEmergencySms({phoneNumber, message, preferredSubscriptionId});
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
        await sosLocalStore.updateSosServiceState(sosId, serviceKey, {
          recipients: [
            ...(latestEvent.services?.[serviceKey]?.recipients || []).filter(item => item.normalizedRecipient !== normalizedRecipient),
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
    console.log('[SOS][SMS] SUMMARY', {sent: sentCount, failed: failedCount, queued: pendingCount});
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
    reason: `${sentCount}/${uniqueNumbers.length} emergency SMS queued by Android.`,
    recipients: results,
    recipientStates: results,
    sentCount,
    failedCount,
    pendingCount,
  };
}

export default {sendEmergencySms, sendEmergencySmsToNumbers, openSmsPermissionSettings};