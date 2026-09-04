export function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s()-]/g, '');
  // Pakistani mobile numbers are commonly stored in the local 03xxxxxxxxx
  // form. Convert that form to the international representation used by the
  // native dialer without requiring the administrator to reformat it.
  if (/^03[0-9]{9}$/.test(compact)) return `+92${compact.slice(1)}`;
  if (/^92[0-9]{10}$/.test(compact)) return `+${compact}`;
  // Preserve short emergency service codes (for example, 15) as well as
  // ordinary international phone numbers.
  if (/^\+[1-9]\d{1,14}$/.test(compact)) return compact;
  if (/^[1-9]\d{1,14}$/.test(compact)) return `+${compact}`;
  return null;
}

export function getCollectionCacheKey(collectionId) {
  if (!collectionId) return null;
  if (typeof collectionId === 'object') {
    return String(collectionId._id || collectionId.id || '');
  }
  return String(collectionId);
}

export default {normalizePhoneNumber, getCollectionCacheKey};
