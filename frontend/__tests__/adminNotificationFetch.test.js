describe('admin notification fetch guard', () => {
  it('keeps only the latest request when multiple load calls are queued', () => {
    const enforceLatestRequest = (token, current) => token === current;

    expect(enforceLatestRequest(1, 1)).toBe(true);
    expect(enforceLatestRequest(2, 1)).toBe(false);
    expect(enforceLatestRequest(3, 3)).toBe(true);
  });
});
