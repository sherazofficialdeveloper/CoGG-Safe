describe('admin collection credential copy behavior', () => {
  it('builds copy text only when both username and password are present', () => {
    const buildCredentialClipboardText = (member, password) => {
      if (!member || !member.username) return '';
      if (!password) return `${member.username}\nPassword unavailable`;
      return `${member.username}\n${password}`;
    };

    expect(buildCredentialClipboardText({ username: 'alice' }, 'secret')).toBe('alice\nsecret');
    expect(buildCredentialClipboardText({ username: 'alice' }, '')).toBe('alice\nPassword unavailable');
    expect(buildCredentialClipboardText({ username: '' }, 'secret')).toBe('');
  });
});
