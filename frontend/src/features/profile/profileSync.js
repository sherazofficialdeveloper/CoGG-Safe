// src/features/profile/profileSync.js
//
// Keeps profile edits (currently: the emergency SMS message) safe when the
// device is offline. The flow is:
//   1. Apply the edit to local state/cache immediately (single source of
//      truth updates right away, regardless of connectivity).
//   2. Try to sync it to the backend.
//   3. If that fails because the network is unavailable, keep the pending
//      update on disk and retry automatically the next time connectivity
//      is restored - the user's new message is never silently reverted.
//   4. If it fails for a real (non-network) reason, surface that clearly
//      instead of a generic "Something went wrong".

import AsyncStorage from '@react-native-async-storage/async-storage';
import {updateMyProfile} from '../../api/resources';

const PENDING_KEY = 'cogg_safe.profile.pendingUpdate';

export async function savePendingProfileUpdate(body) {
  try {
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({body, savedAt: new Date().toISOString()}));
  } catch (error) {
    // Best-effort - the in-memory/user-cache copy of the edit still holds.
  }
}

export async function getPendingProfileUpdate() {
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export async function clearPendingProfileUpdate() {
  try {
    await AsyncStorage.removeItem(PENDING_KEY);
  } catch (error) {
    // Ignore.
  }
}

/**
 * Attempts to push any pending profile edit to the backend. Safe to call
 * whenever connectivity changes; it is a no-op when there is nothing
 * pending. Never throws.
 */
export async function flushPendingProfileUpdate(token, onSynced) {
  const pending = await getPendingProfileUpdate();
  if (!pending?.body || !token) return null;

  try {
    const result = await updateMyProfile(token, pending.body);
    const updatedUser = result?.user || result?.data || result;
    await clearPendingProfileUpdate();
    onSynced?.(updatedUser || pending.body);
    return updatedUser;
  } catch (error) {
    if (error?.status && error.status !== 0) {
      // A real rejection (validation/auth/etc.) - do not retry forever
      // with a payload the server has already rejected. The locally
      // applied value stays in effect for the user; only the backend
      // sync attempt is abandoned.
      await clearPendingProfileUpdate();
    }
    // status === 0 (network unreachable) - keep it queued for next retry.
    return null;
  }
}

export default {savePendingProfileUpdate, getPendingProfileUpdate, clearPendingProfileUpdate, flushPendingProfileUpdate};
