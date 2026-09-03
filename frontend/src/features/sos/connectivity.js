import NetInfo from '@react-native-community/netinfo';
import {NativeModules, Platform} from 'react-native';

const DEFAULT_STATE = {
  isConnected: false,
  isInternetReachable: false,
  isCellularAvailable: false,
  telephonySupported: true,
  telephonyStatus: 'TEMPORARILY_UNAVAILABLE',
  details: null,
};

class ConnectivityService {
  constructor() {
    this.state = {...DEFAULT_STATE};
    this.listeners = new Set();
    this.initialized = false;
    this.telephonyPollHandle = null;
  }

  setup() {
    if (this.initialized) return;
    this.initialized = true;

    NetInfo.addEventListener(state => {
      const nextState = {
        ...this.state,
        isConnected: Boolean(state?.isConnected),
        isInternetReachable: Boolean(state?.isInternetReachable),
        details: state || null,
      };
      this.state = nextState;
      this.listeners.forEach(listener => listener(nextState));

      // Switching data interfaces (Wi-Fi <-> cellular) says nothing about
      // whether the SIM itself has service, so re-check telephony directly
      // instead of inferring it from which interface currently has internet.
      this.refreshTelephonyState();
    });

    this.refreshTelephonyState();

    if (Platform.OS === 'android' && !this.telephonyPollHandle) {
      // SIM/signal state can change (signal lost, SIM removed) without any
      // NetInfo event firing at all when data is routed over Wi-Fi, so poll
      // lightly to keep SMS eligibility accurate.
      this.telephonyPollHandle = setInterval(() => this.refreshTelephonyState(), 15000);
    }
  }

  /**
   * Cellular/SIM readiness for SMS is intentionally independent of which
   * network interface is currently carrying internet traffic: a phone on
   * Wi-Fi with a working SIM must still be treated as cellular-available.
   */
  async refreshTelephonyState() {
    const emergencyMedia = NativeModules?.EmergencyMedia;
    if (Platform.OS !== 'android' || !emergencyMedia || typeof emergencyMedia.getTelephonyState !== 'function') {
      return;
    }

    try {
      const result = await emergencyMedia.getTelephonyState();
      const status = result?.status || 'TEMPORARILY_UNAVAILABLE';
      const nextState = {
        ...this.state,
        isCellularAvailable: status === 'AVAILABLE',
        telephonyStatus: status,
        telephonySupported: status !== 'UNSUPPORTED',
      };
      this.state = nextState;
      this.listeners.forEach(listener => listener(nextState));
    } catch (error) {
      // A failed telephony check must never block SMS; keep prior state.
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  updateState(nextState) {
    this.state = {...DEFAULT_STATE, ...nextState};
    this.listeners.forEach(listener => listener(this.state));
  }

  getState() {
    return {...this.state};
  }

  getInternetAvailability() {
    return Boolean(this.state.isInternetReachable || this.state.isConnected);
  }

  getCellularAvailability() {
    return Boolean(this.state.isCellularAvailable);
  }

  getTelephonyStatus() {
    return this.state.telephonyStatus || 'TEMPORARILY_UNAVAILABLE';
  }

  isTelephonySupported() {
    return this.state.telephonySupported !== false;
  }

  resetForTests() {
    this.state = {...DEFAULT_STATE};
    this.listeners.clear();
    if (this.telephonyPollHandle) {
      clearInterval(this.telephonyPollHandle);
      this.telephonyPollHandle = null;
    }
  }
}

export const connectivityService = new ConnectivityService();
export const subscribeToConnectivity = listener => connectivityService.subscribe(listener);
export const getConnectivityState = () => connectivityService.getState();

export default connectivityService;
