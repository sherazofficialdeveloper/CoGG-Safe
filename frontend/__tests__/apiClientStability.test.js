import {clearApiCache, request} from '../src/api/client';

describe('API request stability', () => {
  beforeEach(() => {
    clearApiCache();
    global.fetch = jest.fn();
  });

  test('deduplicates identical in-flight GET requests and caches the result', async () => {
    let resolveFetch;
    global.fetch.mockImplementation(() => new Promise(resolve => {
      resolveFetch = resolve;
    }));

    const first = request('/notifications', {token: 'token'});
    const second = request('/notifications', {token: 'token'});
    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFetch({ok: true, status: 200, json: async () => ({data: {notifications: []}})});
    await expect(Promise.all([first, second])).resolves.toEqual([{notifications: []}, {notifications: []}]);
    await expect(request('/notifications', {token: 'token'})).resolves.toEqual({notifications: []});
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('does not retry rate-limit responses', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({message: 'Too many requests'}),
    });

    await expect(request('/notifications', {token: 'token'})).rejects.toMatchObject({status: 429});
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
