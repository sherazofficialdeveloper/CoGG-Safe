import {credentialClipboardText, rememberCredential} from '../src/utils/adminCredentials';

describe('admin collection credential copy behavior', () => {
  it('builds copy text only when both username and password are present', () => {
    expect(credentialClipboardText({username: 'alice'}, 'secret')).toBe('alice\nsecret');
    expect(credentialClipboardText({username: 'alice'}, '')).toBe('alice\nPassword unavailable');
    expect(credentialClipboardText({username: ''}, 'secret')).toBe('');
  });

  it('retains a generated password only for the created user id', () => {
    expect(rememberCredential({}, {_id: 'u1'}, 'secret')).toEqual({u1: 'secret'});
    expect(rememberCredential({u1: 'old'}, {_id: 'u1'}, '')).toEqual({u1: 'old'});
  });
});
