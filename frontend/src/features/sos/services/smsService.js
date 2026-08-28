import {Linking, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

export async function sendEmergencySms({phoneNumber, message}) {
  if (!phoneNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency SMS number is configured for this collection.'};
  }

  if (!getConnectivityState().isCellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service unavailable; SMS remains queued.'};
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
  return {status: 'UNSUPPORTED', reason: 'The device SMS app was opened; automatic delivery cannot be confirmed.'};
}

export default { sendEmergencySms };
