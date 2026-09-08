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
    
    // ================= FIX: Android 13+ - Direct settings =================
    if (permissionState === PERMISSION_STATUS.BLOCKED || 
        (permissionState === PERMISSION_STATUS.DENIED && Platform.Version >= 33)) {
      return new Promise((resolve) => {
        Alert.alert(
          'SMS Permission Required',
          '🔒 To send emergency SMS, please enable SMS permission from app settings.\n\n' +
          '📱 Steps:\n' +
          '1. Tap "Open Settings"\n' +
          '2. Tap "Permissions"\n' +
          '3. Enable "SMS" permission',
          [
            {text: 'Cancel', style: 'cancel', onPress: () => {
              resolve({
                status: 'PENDING',
                reason: 'SMS permission required.',
                useComposer: true,
              });
            }},
            {text: 'Open Settings', onPress: async () => {
              await openSmsPermissionSettings();
              resolve({
                status: 'PENDING',
                reason: 'Please enable SMS permission from settings.',
                useComposer: true,
              });
            }}
          ]
        );
      });
    }
    
    // ================= FIX: Android 12 and below - Request permission =================
    if (permissionState === PERMISSION_STATUS.DENIED && Platform.Version < 33) {
      permissionState = await requestPermission('android.permission.SEND_SMS');
    }
    
    const permissionGranted = permissionState === PERMISSION_STATUS.GRANTED;
    emitSosDiagnostic(permissionGranted ? 'SMS DEBUG — SEND_SMS permission granted' : 'SMS ERROR — SEND_SMS permission denied', permissionGranted ? 'info' : 'error');
    
    if (!permissionGranted) {
      // ================= FALLBACK: SMS Composer =================
      if (emergencyMedia?.openSmsComposer) {
        await emergencyMedia.openSmsComposer(phoneNumber, message);
        return {
          status: 'PENDING',
          reason: 'SMS composer opened. Please tap send.',
          useComposer: true,
        };
      }
      
      return {
        status: 'PENDING',
        reason: permissionState === PERMISSION_STATUS.BLOCKED
          ? 'SMS permission is blocked by Android; please enable from settings.'
          : 'SMS permission was not granted yet; retrying after the Android permission flow.',
      };
    }
    
    // ================= Continue with SMS sending =================
    if (typeof emergencyMedia.sendEmergencySms === 'function') {
      if (__DEV__) console.log('[SOS][SMS] SERVICE_INVOKED', {nativeMethod: 'EmergencyMedia.sendEmergencySms'});
      emitSosDiagnostic('SMS DEBUG — Native SMS method invoked');
      if (__DEV__) console.log('[SOS][SMS] ATTEMPT_NATIVE', {recipient: `${phoneNumber.slice(0, 3)}***`});
      
      // ================= Auto-detect SIM =================
      let selectedSubscriptionId = -1;
      
      if (preferredSubscriptionId != null && preferredSubscriptionId >= 0) {
        selectedSubscriptionId = Number(preferredSubscriptionId);
      } else {
        try {
          const saved = await sosLocalStore.getEmergencyCallSimPreference();
          if (saved?.subscriptionId != null) {
            selectedSubscriptionId = Number(saved.subscriptionId);
          }
        } catch (_) {}
      }
      
      if (selectedSubscriptionId < 0) {
        try {
          const simCount = await getActiveSimCount();
          
          if (simCount === 1) {
            const simId = await getDefaultSimId();
            if (simId >= 0) {
              selectedSubscriptionId = simId;
              await sosLocalStore.setEmergencyCallSimPreference(simId, {source: 'auto-single-sim'});
              if (__DEV__) console.log('[SOS][SMS] Single SIM detected, auto-selected:', simId);
            }
          } else if (simCount >= 2) {
            const defaultId = await getDefaultSimId();
            if (defaultId >= 0) {
              selectedSubscriptionId = defaultId;
              await sosLocalStore.setEmergencyCallSimPreference(defaultId, {source: 'auto-dual-sim-slot0'});
              if (__DEV__) console.log('[SOS][SMS] Dual SIM detected, using default SIM:', defaultId);
            }
          }
        } catch (simError) {
          if (__DEV__) console.log('[SOS][SMS] SIM detection error:', simError);
        }
      }

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

export async function chooseSmsSubscription({forcePrompt = false} = {}) {
  if (Platform.OS !== 'android') return -1;
  const module = NativeModules?.EmergencyMedia;
  if (!module || typeof module.getAvailableSims !== 'function') return -1;
  try {
    const rawSims = await module.getAvailableSims();
    const sims = Array.isArray(rawSims) ? rawSims : [];
    
    if (sims.length <= 1) {
      const id = Number(sims[0]?.subscriptionId);
      if (Number.isInteger(id) && id > 0) {
        await sosLocalStore.setEmergencyCallSimPreference(id, {source: 'sms-auto-single-sim'});
        return id;
      }
      return -1;
    }
    
    if (!forcePrompt) {
      const saved = await sosLocalStore.getEmergencyCallSimPreference().catch(() => null);
      const savedId = Number(saved?.subscriptionId);
      if (Number.isInteger(savedId) && sims.some(item => Number(item.subscriptionId) === savedId)) return savedId;
      
      const firstSim = sims[0];
      if (firstSim?.subscriptionId != null) {
        const id = Number(firstSim.subscriptionId);
        if (Number.isInteger(id) && id > 0) {
          await sosLocalStore.setEmergencyCallSimPreference(id, {source: 'sms-auto-dual-sim-slot0'});
          return id;
        }
      }
    }
    
    return new Promise(resolve => {
      let settled = false;
      const finish = async value => {
        if (settled) return;
        settled = true;
        const id = Number(value);
        if (Number.isInteger(id) && id > 0) await sosLocalStore.setEmergencyCallSimPreference(id, {source: 'sms-prompt'}).catch(() => undefined);
        resolve(Number.isInteger(id) && id > 0 ? id : -1);
      };
      const buttons = sims.slice(0, 2).map(sim => ({
        text: sim.displayName || sim.carrierName || `SIM ${Number(sim.slotIndex || 0) + 1}`,
        onPress: () => finish(sim.subscriptionId),
      }));
      buttons.push({text: 'Cancel', style: 'cancel', onPress: () => finish(-1)});
      Alert.alert('Choose SIM for SOS SMS', 'Select the SIM that should send the emergency SMS.', buttons, {cancelable: true, onDismiss: () => finish(-1)});
    });
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