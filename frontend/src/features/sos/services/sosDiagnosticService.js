import {DeviceEventEmitter} from 'react-native';
import {emitSosToast} from './sosToastService';

// Temporary, centralized device diagnostic switch. Set false (or remove this
// module) after call/SMS root-cause investigation is complete.
export const SOS_DEBUG_MODE = false;

let nativeListenerStarted = false;

export function emitSosDiagnostic(message, type = 'info') {
  if (!SOS_DEBUG_MODE || !message) return;
  console.log(`[SOS DEBUG] ${message}`);
  emitSosToast(message, type, 4500);
}

export function ensureSosNativeDiagnosticListener() {
  if (!SOS_DEBUG_MODE || nativeListenerStarted) return;
  nativeListenerStarted = true;
  DeviceEventEmitter.addListener('sosNativeDiagnostic', payload => {
    if (!payload?.message) return;
    emitSosDiagnostic(payload.message, payload.type || 'info');
  });
}

export default {SOS_DEBUG_MODE, emitSosDiagnostic, ensureSosNativeDiagnosticListener};