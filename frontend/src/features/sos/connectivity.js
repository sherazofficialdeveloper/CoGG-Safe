import NetInfo from '@react-native-community/netinfo';

const DEFAULT_STATE = {
  isConnected: false,
  isInternetReachable: false,
  isCellularAvailable: false,
  details: null,
};

class ConnectivityService {
  constructor() {
    this.state = {...DEFAULT_STATE};
    this.listeners = new Set();
    this.initialized = false;
  }

  setup() {
    if (this.initialized) return;
    this.initialized = true;

    NetInfo.addEventListener(state => {
      const nextState = {
        isConnected: Boolean(state?.isConnected),
        isInternetReachable: Boolean(state?.isInternetReachable),
        isCellularAvailable: Boolean(state?.type === 'cellular' && state?.isConnected),
        details: state || null,
      };
      this.state = nextState;
      this.listeners.forEach(listener => listener(nextState));
    });
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

  resetForTests() {
    this.state = {...DEFAULT_STATE};
    this.listeners.clear();
  }
}

export const connectivityService = new ConnectivityService();
export const subscribeToConnectivity = listener => connectivityService.subscribe(listener);
export const getConnectivityState = () => connectivityService.getState();

export default connectivityService;
