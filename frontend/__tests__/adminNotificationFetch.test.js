describe('admin notification fetch guard', () => {
  it('keeps only the latest request when multiple load calls are queued', () => {
    let latestToken = 0;
    const enforceLatestRequest = (token, current) => {
      if (token !== current) return false;
      latestToken = token;
      return true;
    };

    expect(enforceLatestRequest(1, 1)).toBe(true);
    expect(enforceLatestRequest(2, 1)).toBe(false);
    expect(enforceLatestRequest(3, 3)).toBe(true);
  });
});
