import {deleteSos} from '../src/api/resources';
import {request} from '../src/api/client';

jest.mock('../src/api/client', () => ({
  request: jest.fn(),
}));

describe('SOS delete API helper', () => {
  it('calls the existing backend delete endpoint with the auth token', async () => {
    request.mockResolvedValue({ ok: true });

    await deleteSos('token-123', 'sos-456');

    expect(request).toHaveBeenCalledWith('/sos/sos-456', {method: 'DELETE', token: 'token-123'});
  });
});
