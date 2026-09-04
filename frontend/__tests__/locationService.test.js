jest.mock('@react-native-community/geolocation', () => ({
  __esModule: true,
  default: {getCurrentPosition: jest.fn()},
}));

jest.mock('../src/features/sos/storage', () => ({
  sosLocalStore: {
    getAllEvents: jest.fn(async () => []),
  },
}));

jest.mock('../src/permissions/sosPermissions', () => ({
  PERMISSION_STATUS: {GRANTED: 'granted', DENIED: 'denied'},
  checkPermission: jest.fn(async () => 'granted'),
  requestPermission: jest.fn(async () => 'granted'),
}));

import Geolocation from '@react-native-community/geolocation';
import {getCurrentLocation, isValidLocation} from '../src/features/sos/services/locationService';
import {sosLocalStore} from '../src/features/sos/storage';

describe('location validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('accepts valid coordinates with capture metadata', () => {
    expect(isValidLocation({
      latitude: 1.2,
      longitude: -3.4,
      accuracy: 12,
      capturedAt: '2026-09-03T00:00:00.000Z',
    })).toBe(true);
  });

  test('rejects invalid coordinates, timestamps, and accuracy metadata', () => {
    expect(isValidLocation({latitude: 91, longitude: 0, capturedAt: 'now'})).toBe(false);
    expect(isValidLocation({latitude: 0, longitude: 0})).toBe(false);
    expect(isValidLocation({latitude: 0, longitude: 0, capturedAt: 'invalid-date', accuracy: NaN})).toBe(false);
    expect(isValidLocation({latitude: 0, longitude: 0, capturedAt: '2026-09-03T00:00:00.000Z', accuracy: 0})).toBe(true);
  });

  test('returns a network fallback when GPS is unavailable', async () => {
    Geolocation.getCurrentPosition.mockImplementationOnce((success, error) => {
      error({message: 'GPS unavailable', code: 2});
    }).mockImplementationOnce((success) => {
      success({
        coords: {latitude: 12.5, longitude: -4.25, accuracy: 18},
        provider: 'network',
        timestamp: '2026-09-03T00:00:00.000Z',
      });
    });

    await expect(getCurrentLocation()).resolves.toEqual(expect.objectContaining({
      latitude: 12.5,
      longitude: -4.25,
      source: 'network',
    }));
  });

  test('falls back to the most recent valid cached SOS location when no provider is available', async () => {
    Geolocation.getCurrentPosition
      .mockImplementationOnce((success, error) => error({message: 'No location provider available', code: 2}))
      .mockImplementationOnce((success, error) => error({message: 'No location provider available', code: 2}));
    sosLocalStore.getAllEvents.mockResolvedValue([
      {location: {latitude: 6.1, longitude: 7.2, accuracy: 9, capturedAt: '2026-09-01T00:00:00.000Z', source: 'network'}},
      {location: {latitude: 8.7, longitude: 9.3, accuracy: 12, capturedAt: '2026-09-03T00:00:00.000Z', source: 'gps'}},
    ]);

    await expect(getCurrentLocation()).resolves.toEqual(expect.objectContaining({
      latitude: 8.7,
      longitude: 9.3,
      source: 'gps',
    }));
  });

  test('rejects when both current and cached locations are unavailable', async () => {
    Geolocation.getCurrentPosition
      .mockImplementationOnce((success, error) => error({message: 'No location provider available', code: 2}))
      .mockImplementationOnce((success, error) => error({message: 'No location provider available', code: 2}));
    sosLocalStore.getAllEvents.mockResolvedValue([]);

    await expect(getCurrentLocation()).rejects.toThrow(/No usable location provider/i);
  });
});
