import {Platform} from 'react-native';
import Config from 'react-native-config';

const localHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
const defaultApiBaseUrl = `http://${localHost}:8000/api`;

export const API_BASE_URL = (Config.COGGSAFE_API_BASE_URL || defaultApiBaseUrl).replace(/\/$/, '');
