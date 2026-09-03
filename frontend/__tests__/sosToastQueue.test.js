import {
  DEFAULT_SOS_TOAST_DURATION,
  dismissSosToast,
  emitSosToast,
  resetSosToastQueueForTests,
  subscribeSosToasts,
} from '../src/features/sos/services/sosToastService';

describe('SOS toast queue', () => {
  beforeEach(() => resetSosToastQueueForTests());

  test('presents simultaneous results sequentially with the professional default duration', () => {
    const active = [];
    const subscription = subscribeSosToasts(toast => active.push(toast?.message || null));
    const first = emitSosToast('Front camera captured', 'success');
    emitSosToast('Back camera captured', 'success');
    emitSosToast('Audio recorded', 'success');

    expect(first.duration).toBe(DEFAULT_SOS_TOAST_DURATION);
    expect(active).toEqual([null, 'Front camera captured']);
    dismissSosToast(first.id);
    expect(active.at(-1)).toBe('Back camera captured');
    dismissSosToast();
    expect(active.at(-1)).toBe('Audio recorded');
    subscription.remove();
  });

  test('deduplicates identical callbacks but retains distinct failures', () => {
    const active = [];
    const subscription = subscribeSosToasts(toast => active.push(toast?.message || null));
    const first = emitSosToast('Front camera capture failed', 'error');
    emitSosToast('Front camera capture failed', 'error');
    emitSosToast('Back camera capture failed', 'error');

    dismissSosToast(first.id);
    expect(active).toEqual([null, 'Front camera capture failed', 'Back camera capture failed']);
    subscription.remove();
  });
});