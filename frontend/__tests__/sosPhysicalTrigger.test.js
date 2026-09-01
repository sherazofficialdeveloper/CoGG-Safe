import {
  consumePowerButtonPress,
  POWER_BUTTON_TRIGGER_COUNT,
  POWER_BUTTON_TRIGGER_WINDOW_MS,
} from '../src/features/sos/powerButtonTrigger';

describe('power-button SOS trigger logic', () => {
  it('fires after three valid presses within the five-second window', () => {
    let presses = [];
    let result;

    [0, 1200, 2400].forEach(timestamp => {
      result = consumePowerButtonPress({
        presses,
        timestamp,
        windowMs: POWER_BUTTON_TRIGGER_WINDOW_MS,
        threshold: POWER_BUTTON_TRIGGER_COUNT,
      });
      presses = result.presses;
    });

    expect(result.triggered).toBe(true);
    expect(result.presses).toHaveLength(3);
  });

  it('drops stale presses that are older than the five-second trigger window', () => {
    const result = consumePowerButtonPress({
      presses: [0, 1200, 6000],
      timestamp: 7000,
      windowMs: POWER_BUTTON_TRIGGER_WINDOW_MS,
      threshold: POWER_BUTTON_TRIGGER_COUNT,
    });

    expect(result.triggered).toBe(false);
    expect(result.presses).toEqual([6000, 7000]);
  });
});
