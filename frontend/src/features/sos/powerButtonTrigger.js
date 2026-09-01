export const POWER_BUTTON_TRIGGER_WINDOW_MS = 5000;
export const POWER_BUTTON_TRIGGER_COUNT = 3;

export function consumePowerButtonPress({
  presses = [],
  timestamp = Date.now(),
  windowMs = POWER_BUTTON_TRIGGER_WINDOW_MS,
  threshold = POWER_BUTTON_TRIGGER_COUNT,
} = {}) {
  const safeTimestamps = Array.isArray(presses)
    ? presses.filter(value => Number.isFinite(value))
    : [];

  const recent = [...safeTimestamps, timestamp]
    .filter(value => Number.isFinite(value) && timestamp - value <= windowMs)
    .sort((left, right) => left - right);

  const deduped = recent.filter((value, index) => index === 0 || value !== recent[index - 1]);

  return {
    presses: deduped,
    triggered: deduped.length >= threshold,
    threshold,
    windowMs,
  };
}
