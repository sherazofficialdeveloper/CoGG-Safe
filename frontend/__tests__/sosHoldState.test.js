import {getHoldSnapshot, SOS_HOLD_DURATION_MS} from '../src/features/sos/holdState';

describe('SOS hold state helper', () => {
  it('keeps the hold pending before the user reaches the three-second threshold', () => {
    const initialSnapshot = getHoldSnapshot({
      startedAt: 0,
      now: 0,
      durationMs: SOS_HOLD_DURATION_MS,
    });
    const partialSnapshot = getHoldSnapshot({
      startedAt: 0,
      now: 1999,
      durationMs: SOS_HOLD_DURATION_MS,
    });

    expect(initialSnapshot.progress).toBe(0);
    expect(initialSnapshot.countdown).toBe(3);
    expect(partialSnapshot.progress).toBeLessThan(1);
    expect(partialSnapshot.countdown).toBe(2);
    expect(partialSnapshot.shouldActivate).toBe(false);
  });

  it('counts down 3, 2, 1, then 0 at exact one-second boundaries', () => {
    expect(getHoldSnapshot({startedAt: 1000, now: 1000}).countdown).toBe(3);
    expect(getHoldSnapshot({startedAt: 1000, now: 2000}).countdown).toBe(2);
    expect(getHoldSnapshot({startedAt: 1000, now: 3000}).countdown).toBe(1);
    expect(getHoldSnapshot({startedAt: 1000, now: 4000}).countdown).toBe(0);
  });

  it('activates exactly once when the hold reaches the full three-second duration', () => {
    const snapshot = getHoldSnapshot({
      startedAt: 0,
      now: SOS_HOLD_DURATION_MS,
      durationMs: SOS_HOLD_DURATION_MS,
    });

    expect(snapshot.progress).toBe(1);
    expect(snapshot.countdown).toBe(0);
    expect(snapshot.shouldActivate).toBe(true);
  });
});
