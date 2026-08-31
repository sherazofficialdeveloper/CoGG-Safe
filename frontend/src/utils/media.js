export function buildMediaUrl(baseUrl, primaryId, secondaryIdOrComponent, maybeComponent) {
  if (!baseUrl) return null;

  const normalizedBase = String(baseUrl).replace(/\/$/, '');

  if (maybeComponent) {
    return `${normalizedBase}/sos/${secondaryIdOrComponent}/media/${maybeComponent}/file`;
  }

  if (!primaryId || !secondaryIdOrComponent) return null;
  return `${normalizedBase}/sos/${primaryId}/media/${secondaryIdOrComponent}/file`;
}

export function buildMediaRequestOptions(token) {
  return {
    headers: {
      ...(token ? {Authorization: `Bearer ${token}`} : {}),
    },
  };
}

export default { buildMediaUrl, buildMediaRequestOptions };
