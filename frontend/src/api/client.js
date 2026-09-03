import {API_BASE_URL} from './config';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const GET_CACHE_TTL_MS = 30000;
const responseCache = new Map();
const inFlightRequests = new Map();

function requestKey(path, token) {
  return `${token || 'anonymous'}:${path}`;
}

function invalidateCache() {
  responseCache.clear();
}

export function getCachedApiData(path, token) {
  return responseCache.get(requestKey(path, token))?.data || null;
}

export async function request(path, {method = 'GET', body, token} = {}) {
  const normalizedMethod = method.toUpperCase();
  const key = requestKey(path, token);
  if (normalizedMethod === 'GET') {
    const cached = responseCache.get(key);
    if (cached && Date.now() - cached.cachedAt < GET_CACHE_TTL_MS) {
      if (__DEV__) console.log('[API] CACHE_HIT', {method: normalizedMethod, path});
      return cached.data;
    }
    const existingRequest = inFlightRequests.get(key);
    if (existingRequest) {
      if (__DEV__) console.log('[API] IN_FLIGHT_DEDUP', {method: normalizedMethod, path});
      return existingRequest;
    }
  } else {
    invalidateCache();
  }

  const executeRequest = async () => {
  let response;
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutHandle = setTimeout(() => controller?.abort(), 15000);

  try {
    if (__DEV__) console.log('[API] REQUEST_START', {method: normalizedMethod, path});
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: normalizedMethod,
      headers: {
        Accept: 'application/json',
        ...(isMultipart ? {} : {'Content-Type': 'application/json'}),
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      ...(body === undefined ? {} : {body: isMultipart ? body : JSON.stringify(body)}),
      ...(controller ? {signal: controller.signal} : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ApiError('The request timed out. Check your connection and try again.', 0);
    }
    throw new ApiError('Unable to connect to CoGG Safety. Check your network and try again.', 0);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    if (__DEV__ && response.status === 429) console.warn('[API] RATE_LIMITED', {method: normalizedMethod, path});
    throw new ApiError(payload.message || 'The server could not complete that request.', response.status);
  }

  if (__DEV__) console.log('[API] REQUEST_COMPLETE', {method: normalizedMethod, path, status: response.status});
  return payload.data;
  };

  const requestPromise = executeRequest();
  if (normalizedMethod === 'GET') {
    inFlightRequests.set(key, requestPromise);
    requestPromise
      .then(
        data => responseCache.set(key, {data, cachedAt: Date.now()}),
        () => undefined,
      )
      .then(() => inFlightRequests.delete(key));
  }
  return requestPromise;
}

export function clearApiCache() {
  responseCache.clear();
}
