import {getAuthErrorMessage} from '../src/api/errorMessages';

describe('authentication error messages', () => {
  test('preserves backend authentication and conflict categories', () => {
    expect(getAuthErrorMessage({status: 401, message: 'Invalid credentials'})).toBe('Authentication failed. Please check your credentials.');
    expect(getAuthErrorMessage({status: 409, message: 'username already exists'})).toBe('username already exists');
  });

  test('distinguishes missing token and network failures', () => {
    expect(getAuthErrorMessage({status: 401, message: 'Authentication token missing'})).toContain('token missing');
    expect(getAuthErrorMessage({status: 0})).toContain('Unable to connect');
  });
});
