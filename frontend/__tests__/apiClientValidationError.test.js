import {ApiError} from '../src/api/client';

describe('API validation errors', () => {
  test('preserves safe field-level validation details from the backend', () => {
    const error = new ApiError('Validation failed', 400, [
      {field: 'mobileNumber', message: 'Mobile number must include country code, e.g. +923001234567'},
    ]);

    expect(error.message).toBe('Validation failed');
    expect(error.status).toBe(400);
    expect(error.details).toEqual([
      {field: 'mobileNumber', message: 'Mobile number must include country code, e.g. +923001234567'},
    ]);
  });
});
