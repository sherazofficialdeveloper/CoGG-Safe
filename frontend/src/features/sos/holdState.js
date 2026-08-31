export const SOS_HOLD_DURATION_MS = 3000;

export function getHoldSnapshot({startedAt, now, durationMs = SOS_HOLD_DURATION_MS} = {}) {
  const safeStartedAt = Number(startedAt) || 0;
  const safeNow = Number(now) || safeStartedAt;
  const elapsedMs = Math.max(0, safeNow - safeStartedAt);
  const progress = Math.min(elapsedMs / durationMs, 1);
  const countdown = Math.max(1, 3 - Math.ceil(elapsedMs / 1000));

  return {
    elapsedMs,
    progress,
    countdown,
    shouldActivate: progress >= 1,
  };
}
