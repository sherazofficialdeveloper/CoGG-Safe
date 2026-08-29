import {Linking, Platform} from 'react-native';

export async function initiateEmergencyCall({emergencyNumber}) {
  if (!emergencyNumber) {
    return {status: 'NOT_CONFIGURED', reason: 'No emergency call number is configured for this collection.'};
  }

  const url = Platform.OS === 'android' ? `tel:${emergencyNumber}` : `telprompt:${emergencyNumber}`;
  const supported = await Linking.canOpenURL(url);

  if (!supported) {
    throw new Error('This device cannot initiate a call from the app.');
  }

  await Linking.openURL(url);
  return {status: 'COMPLETED'};
}

export default { initiateEmergencyCall };
