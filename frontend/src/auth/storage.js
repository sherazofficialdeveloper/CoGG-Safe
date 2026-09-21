import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVICE = 'com.coggsafe.auth';
// Non-sensitive profile snapshot cached alongside the token so the app can
// restore a fully authenticated screen (username, emergency message, role,
// collection, etc.) without waiting on a network call. The token itself
// stays exclusively in the secure Keychain; this cache never holds
// credentials or the token.
const USER_CACHE_KEY = 'cogg_safe.auth.userCache';

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

export async function saveCachedUser(user) {
  if (!user) return;
  try {
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  } catch (error) {
    // Non-fatal: worst case, the next offline restore falls back to
    // whatever was cached previously (or the login screen if there was
    // never a successful cache write).
  }
}

export async function readCachedUser() {
  try {
    const raw = await AsyncStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export async function clearCachedUser() {
  try {
    await AsyncStorage.removeItem(USER_CACHE_KEY);
  } catch (error) {
    // Ignore - clearToken() already guarantees logout proceeds.
  }
}