/** Centralized one-at-a-time queue for SOS feedback. */
export const DEFAULT_SOS_TOAST_DURATION = 4500;

let activeToast = null;
let queuedToasts = [];
const listeners = new Set();

function notify() {
  listeners.forEach(listener => listener(activeToast));
}

function activateNext() {
  activeToast = queuedToasts.shift() || null;
  if (__DEV__ && activeToast) console.log('[SOS][TOAST] SHOW', {id: activeToast.id, type: activeToast.type, message: activeToast.message});
  notify();
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
  if ((activeToast && toastKey(activeToast) === key) || queuedToasts.some(item => toastKey(item) === key)) {
    if (__DEV__) console.log('[SOS][TOAST] DEDUPED', {type, message});
    return activeToast || queuedToasts.find(item => toastKey(item) === key) || null;
  }
  queuedToasts.push(toast);
  if (__DEV__) console.log('[SOS][TOAST] QUEUED', {id: toast.id, type, message, queueLength: queuedToasts.length});
  if (!activeToast) activateNext();
  return toast;
}

export function dismissSosToast(id) {
  if (!activeToast || (id && activeToast.id !== id)) return;
  if (__DEV__) console.log('[SOS][TOAST] DISMISS', {id: activeToast.id});
  activateNext();
}

export function subscribeSosToasts(listener) {
  listeners.add(listener);
  listener(activeToast);
  return {remove: () => listeners.delete(listener)};
}

export function resetSosToastQueueForTests() {
  activeToast = null;
  queuedToasts = [];
  notify();
}

export default {emitSosToast, dismissSosToast, subscribeSosToasts, DEFAULT_SOS_TOAST_DURATION};