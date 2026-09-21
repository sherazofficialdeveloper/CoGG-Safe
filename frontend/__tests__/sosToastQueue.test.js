import {
  DEFAULT_SOS_TOAST_DURATION,
  dismissSosToast,
  emitSosToast,
  resetSosToastQueueForTests,
  subscribeSosToasts,
} from '../src/features/sos/services/sosToastService';

describe('SOS toast stack', () => {
  beforeEach(() => resetSosToastQueueForTests());

  test('keeps distinct results visible simultaneously with independent dismissal', () => {
    const active = [];
    const subscription = subscribeSosToasts(toasts => active.push(toasts.map(toast => toast.message)));
    const first = emitSosToast('Front camera captured', 'success');
    emitSosToast('Back camera captured', 'success');
    emitSosToast('Audio recorded', 'success');

    expect(first.duration).toBe(DEFAULT_SOS_TOAST_DURATION);
    expect(active.at(-1)).toEqual(['Front camera captured', 'Back camera captured', 'Audio recorded']);
    dismissSosToast(first.id);
    expect(active.at(-1)).toEqual(['Back camera captured', 'Audio recorded']);
    subscription.remove();
  });

  test('deduplicates identical callbacks but retains distinct failures', () => {
    const active = [];
    const subscription = subscribeSosToasts(toasts => active.push(toasts.map(toast => toast.message)));
    const first = emitSosToast('Front camera capture failed', 'error');
    emitSosToast('Front camera capture failed', 'error');
    emitSosToast('Back camera capture failed', 'error');

    expect(active.at(-1)).toEqual(['Front camera capture failed', 'Back camera capture failed']);
    dismissSosToast(first.id);
    subscription.remove();
  });
});