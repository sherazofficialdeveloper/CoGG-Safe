import {getCachedApiData} from '../src/api/client';
import {getSos, listSos} from '../src/api/resources';

describe('API cache access', () => {
  test('screens can import cache access separately from SOS resources', () => {
    expect(typeof getCachedApiData).toBe('function');
    expect(typeof getSos).toBe('function');
    expect(typeof listSos).toBe('function');
  });
});
