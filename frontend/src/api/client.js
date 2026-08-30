import {API_BASE_URL} from './config';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function request(path, {method = 'GET', body, token} = {}) {
  let response;
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(isMultipart ? {} : {'Content-Type': 'application/json'}),
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
      },
      ...(body === undefined ? {} : {body: isMultipart ? body : JSON.stringify(body)}),
    });
  } catch (error) {
    throw new ApiError('Unable to connect to CoGG Safety. Check your network and try again.', 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new ApiError(payload.message || 'The server could not complete that request.', response.status);
  }

  return payload.data;
}

