import {Linking, Platform} from 'react-native';
import {getConnectivityState} from '../connectivity';

export async function initiateEmergencyCall({emergencyNumber}) {
  if (!emergencyNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency call number is configured for this collection.'};
  }

  if (!getConnectivityState().isCellularAvailable) {
    return {status: 'PENDING', reason: 'Cellular service unavailable; call remains queued.'};
  }

  const url = Platform.OS === 'android' ? `tel:${emergencyNumber}` : `telprompt:${emergencyNumber}`;
  const supported = await Linking.canOpenURL(url);

  if (!supported) {
    throw new Error('This device cannot initiate a call from the app.');
  }

  await Linking.openURL(url);
  return {status: 'UNSUPPORTED', reason: 'The device dialer was opened; call connection cannot be confirmed.'};
}

export default { initiateEmergencyCall };
