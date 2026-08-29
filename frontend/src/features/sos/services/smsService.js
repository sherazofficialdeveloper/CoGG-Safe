import {Linking, Platform} from 'react-native';

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  const body = encodeURIComponent(message || 'Emergency assistance requested.');
  const url = Platform.OS === 'android'
    ? `sms:${phoneNumber}?body=${body}`
    : `sms:${phoneNumber}&body=${body}`;

  const supported = await Linking.canOpenURL(url);
  if (!supported) {
    throw new Error('This device cannot open the SMS app.');
  }

  await Linking.openURL(url);
  return {status: 'COMPLETED'};
}

export default { sendEmergencySms };
