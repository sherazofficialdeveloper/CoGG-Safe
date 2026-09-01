import {NativeModules, Platform} from 'react-native';

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  if (Platform.OS !== 'android') {
    return {status: 'UNSUPPORTED', reason: 'The system SMS composer is only supported on Android devices.'};
  }

  const emergencyMedia = NativeModules?.EmergencyMedia;
  if (!emergencyMedia || typeof emergencyMedia.openSmsComposer !== 'function') {
    return {
      status: 'UNSUPPORTED',
      reason: 'The Android system SMS composer is unavailable on this device.',
    };
  }

  try {
    const result = await emergencyMedia.openSmsComposer(
      phoneNumber,
      message || 'Emergency assistance requested.',
    );
    if (String(result?.status || '').toUpperCase() === 'UNSUPPORTED') {
      return {
        status: 'UNSUPPORTED',
        reason: result?.reason || 'No Android SMS application is available to compose the emergency message.',
      };
    }
    return {
      status: 'PENDING',
      reason: result?.reason || 'Android opened the system SMS composer. User confirmation is required before the message is sent.',
    };
  } catch (error) {
    return {
      status: 'UNSUPPORTED',
      reason: error?.message || 'Android could not open an SMS application for the emergency message.',
    };
  }
}

export default {sendEmergencySms};