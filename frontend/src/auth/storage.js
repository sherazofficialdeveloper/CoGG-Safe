import * as Keychain from 'react-native-keychain';

const SERVICE = 'com.coggsafe.auth';

export async function saveToken(token) {
  await Keychain.setGenericPassword('session', token, {service: SERVICE});
}

export async function readToken() {
  const credentials = await Keychain.getGenericPassword({service: SERVICE});
  return credentials ? credentials.password : null;
}

export async function clearToken() {
  try {
    await Keychain.resetGenericPassword({service: SERVICE});
  } catch (error) {
    // Cleanup must not prevent the app from returning to the login screen.
  }
}