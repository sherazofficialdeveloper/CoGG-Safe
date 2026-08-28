import {Platform} from 'react-native';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';

export const API_BASE_URL = `http://${localHost}:8000/api`;
