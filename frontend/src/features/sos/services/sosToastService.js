/** Centralized concurrent stack for SOS feedback. */
export const DEFAULT_SOS_TOAST_DURATION = 4500;

let activeToasts = [];
const listeners = new Set();

function notify() {
  listeners.forEach(listener => listener(activeToasts));
}

function toastKey(toast) {
  return `${toast.type}:${toast.title || ''}:${toast.message}`;
}

export function emitSosToast(message, type = 'info', duration = DEFAULT_SOS_TOAST_DURATION, options = {}) {
  if (!message) return null;
  const toast = {
    id: `sos-toast-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message, type, title: options.title || null,
    duration: Number.isFinite(duration) && duration > 0 ? Math.max(duration, DEFAULT_SOS_TOAST_DURATION) : DEFAULT_SOS_TOAST_DURATION,
    createdAt: new Date().toISOString(),
  };
  const key = toastKey(toast);
  if (activeToasts.some(item => toastKey(item) === key)) {
    if (__DEV__) console.log('[SOS][TOAST] DEDUPED', {type, message});
    return activeToasts.find(item => toastKey(item) === key) || null;
  }
  activeToasts = [...activeToasts.slice(-4), toast];
  if (__DEV__) console.log('[SOS][TOAST] SHOW', {id: toast.id, type, message, stackLength: activeToasts.length});
  notify();
  return toast;
}

export function dismissSosToast(id) {
  if (!id) return;
  const next = activeToasts.filter(item => item.id !== id);
  if (next.length === activeToasts.length) return;
  if (__DEV__) console.log('[SOS][TOAST] DISMISS', {id});
  activeToasts = next;
  notify();
}

export function subscribeSosToasts(listener) {
  listeners.add(listener);
  listener(activeToasts);
  return {remove: () => listeners.delete(listener)};
}

export function resetSosToastQueueForTests() {
  activeToasts = [];
  notify();
}

export default {emitSosToast, dismissSosToast, subscribeSosToasts, DEFAULT_SOS_TOAST_DURATION};