import {DeviceEventEmitter} from 'react-native';

/**
 * Global SOS toast event emitter.
 * Emits toast events that can be consumed by any mounted Toast component,
 * even if the SOS screen is not visible.
 */

export const SOS_TOAST_EVENT = 'sos_toast';

export function emitSosToast(message, type = 'info', duration = 3000) {
  DeviceEventEmitter.emit(SOS_TOAST_EVENT, {
    message,
    type, // 'success', 'error', 'info', 'warning'
    duration,
    timestamp: new Date().toISOString(),
  });
}

export function subscribeSosToasts(listener) {
  return DeviceEventEmitter.addListener(SOS_TOAST_EVENT, listener);
}

export default {
  emitSosToast,
  subscribeSosToasts,
  SOS_TOAST_EVENT,
};
