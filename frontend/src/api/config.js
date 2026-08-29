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

export const API_BASE_URL = normalizeApiBaseUrl(
  Config.COGGSAFE_API_BASE_URL || defaultApiBaseUrl,
);
