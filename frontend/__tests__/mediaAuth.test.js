import {buildMediaUrl, buildMediaRequestOptions} from '../src/utils/media';

describe('media auth helpers', () => {
  it('builds an authenticated media URL for an SOS component', () => {
    const url = buildMediaUrl('https://api.example.com', 'abc123', '123', 'frontImage');
    expect(url).toBe('https://api.example.com/sos/123/media/frontImage/file');
  });

  it('adds the auth token to media fetch requests', () => {
    const options = buildMediaRequestOptions('token-xyz');
    expect(options.headers.Authorization).toBe('Bearer token-xyz');
  });
});
