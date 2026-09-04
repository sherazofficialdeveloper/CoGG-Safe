export function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s()-]/g, '');
  // Strip only common display formatting. Country codes, leading zeroes,
  // short service codes, and the administrator's exact dialable digits remain
  // unchanged for Android's platform-level telephone validation.
  if (!/^\+?[0-9]+$/.test(compact)) return null;
  return compact;
}

export function getCollectionCacheKey(collectionId) {
  if (!collectionId) return null;
  if (typeof collectionId === 'object') {
    return String(collectionId._id || collectionId.id || '');
  }
  return String(collectionId);
}

export default {normalizePhoneNumber, getCollectionCacheKey};
