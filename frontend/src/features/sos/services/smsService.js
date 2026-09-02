import {NativeModules, Platform} from 'react-native';

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

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
    // Try direct SMS send first (preferred)
    if (typeof emergencyMedia.sendEmergencySms === 'function') {
      const result = await emergencyMedia.sendEmergencySms(
        phoneNumber,
        message || 'Emergency assistance requested.',
      );
      
      if (String(result?.status || '').toUpperCase() === 'SENT') {
        return {
          status: 'COMPLETED',
          reason: result?.reason || 'SMS sent via carrier network.',
          subscriptionId: result?.subscriptionId || null,
        };
      }
      
      if (String(result?.status || '').toUpperCase() === 'UNSUPPORTED') {
        return {
          status: 'UNSUPPORTED',
          reason: result?.reason || 'SMS capability unavailable on this device.',
        };
      }
    }

    // Fallback to SMS composer for user confirmation
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

export default {sendEmergencySms};