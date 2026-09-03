export function normalizePhoneNumber(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[\s()-]/g, '');
  if (/^03\d{9}$/.test(compact)) return `+92${compact.slice(1)}`;
  if (/^92\d{10}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{6,14}$/.test(compact)) return compact;
  if (/^[1-9]\d{6,14}$/.test(compact)) return `+${compact}`;
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
