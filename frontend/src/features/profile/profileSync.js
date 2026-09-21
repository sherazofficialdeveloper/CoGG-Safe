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

const PENDING_KEY_PREFIX = 'cogg_safe.profile.pendingUpdate:';
const getPendingKey = userId => `${PENDING_KEY_PREFIX}${String(userId || 'unknown')}`;

export async function savePendingProfileUpdate(userId, body) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(getPendingKey(userId), JSON.stringify({body, savedAt: new Date().toISOString()}));
  } catch (error) {
    // Best-effort - the in-memory/user-cache copy of the edit still holds.
  }
}

export async function getPendingProfileUpdate(userId) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(getPendingKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export async function clearPendingProfileUpdate(userId) {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(getPendingKey(userId));
  } catch (error) {
    // Ignore.
  }
}

/**
 * Attempts to push any pending profile edit to the backend. Safe to call
 * whenever connectivity changes; it is a no-op when there is nothing
 * pending. Never throws.
 */
export async function flushPendingProfileUpdate(token, userId, onSynced) {
  const pending = await getPendingProfileUpdate(userId);
  if (!pending?.body || !token) return null;

  try {
    const result = await updateMyProfile(token, pending.body);
    const updatedUser = result?.user || result?.data || result;
    await clearPendingProfileUpdate(userId);
    onSynced?.(updatedUser || pending.body);
    return updatedUser;
  } catch (error) {
    if (error?.status && error.status !== 0) {
      // A real rejection (validation/auth/etc.) - do not retry forever
      // with a payload the server has already rejected. The locally
      // applied value stays in effect for the user; only the backend
      // sync attempt is abandoned.
      await clearPendingProfileUpdate(userId);
    }
    // status === 0 (network unreachable) - keep it queued for next retry.
    return null;
  }
}

export default {savePendingProfileUpdate, getPendingProfileUpdate, clearPendingProfileUpdate, flushPendingProfileUpdate};
