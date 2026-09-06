export function buildMediaUrl(baseUrl, primaryId, secondaryIdOrComponent, maybeComponent) {
  if (!baseUrl) return null;

  const normalizedBase = String(baseUrl).replace(/\/$/, '');

  if (maybeComponent) {
    return `${normalizedBase}/sos/${secondaryIdOrComponent}/media/${maybeComponent}/file`;
  }

  if (!primaryId || !secondaryIdOrComponent) return null;
  return `${normalizedBase}/sos/${primaryId}/media/${secondaryIdOrComponent}/file`;
}

export function buildEmergencyMediaUrl(emergencyLink, component) {
  if (!emergencyLink || !component) return null;
  const base = String(emergencyLink).replace(/\/$/, '');
  const token = base.split('/').filter(Boolean).pop();
  if (!token) return null;
  try {
    const url = new URL(base);
    return `${url.origin}/api/emergency/${encodeURIComponent(token)}/media/${encodeURIComponent(component)}`;
  } catch (_) {
    return null;
  }
}

export function buildMediaRequestOptions(token) {
  return {
    headers: {
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
  };
}

export default { buildMediaUrl, buildEmergencyMediaUrl, buildMediaRequestOptions };
