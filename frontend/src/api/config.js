import {Platform} from 'react-native';
import Config from 'react-native-config';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const defaultApiBaseUrl = `http://${localHost}:8000/api`;

const normalizeApiBaseUrl = url => {
  if (!url) return defaultApiBaseUrl;

  const normalized = url.replace(/\/$/, '');

  if (Platform.OS === 'android') {
    return normalized.replace(/http:\/\/(localhost|127\.0\.0\.1)/i, 'http://10.0.2.2');
  }

  return normalized;
};

const configuredApiBaseUrl = Config.COGGSAFE_API_BASE_URL;
export const API_BASE_URL = normalizeApiBaseUrl(configuredApiBaseUrl || defaultApiBaseUrl);

// 10.0.2.2 is the Android EMULATOR's alias for the host machine's
// localhost — it only works inside an emulator. On a physical Android
// device (or any real network), it resolves to nothing and every backend
// call (SOS creation, login, everything) silently fails/times out, which
// looks exactly like "backend never goes active" with no visible error.
//
// This is a config problem, not something that can be auto-fixed from
// code — but it should never fail SILENTLY. Set COGGSAFE_API_BASE_URL in
// frontend/.env.local (or a build-variant-specific .env file loaded via
// react-native-config's ENVFILE) to your backend's actual reachable
// address:
//   - Android emulator:      http://10.0.2.2:8000/api        (default)
//   - Physical Android device: http://<your-machine-LAN-IP>:8000/api
//     (device and backend must be on the same network/Wi-Fi)
//   - Production:             https://your-real-domain.com/api
if (__DEV__ && !configuredApiBaseUrl) {
  }

/**
 * One-shot startup reachability check against the unauthenticated
 * /api/health endpoint (per the "verify the app can actually reach
 * /api/health and POST /api/sos" requirement). Never throws and never
 * blocks app startup — it only logs, so a developer immediately sees
 * WHY nothing else is working instead of debugging call/SMS/backend
 * symptoms one at a time.
 */
export async function checkApiReachability() {
  try {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
    const response = await fetch(`${API_BASE_URL}/health`, {
      signal: controller?.signal,
    });
    if (timeoutId) clearTimeout(timeoutId);
    if (response.ok) {
            return true;
    }
        return false;
  } catch (error) {
        return false;
  }
}
