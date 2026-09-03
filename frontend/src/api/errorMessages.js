export function getAuthErrorMessage(error, fallback = 'Unable to complete the request.') {
  const status = error?.status;
  const message = error?.message || '';

  if (status === 0) return 'Unable to connect. Please check your internet connection and try again.';
  if (status === 401 && /missing/i.test(message)) return 'Authentication token missing. Please sign in again.';
  if (status === 401 && /expired/i.test(message)) return 'Your session has expired. Please sign in again.';
  if (status === 401) return 'Authentication failed. Please check your credentials.';
  if (status === 403) return message || 'You are not authorized to perform this action.';
  if (status === 409) return message || 'This record already exists.';
  if (status === 400) return message || 'Validation failed.';
  return message || fallback;
}

export default getAuthErrorMessage;
