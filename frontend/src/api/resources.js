import {request} from './client';

const queryString = params => {
  const entries = Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== '');
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const listNotifications = (token, params, options = {}) =>
  request(`/notifications${queryString(params)}`, {token, ...options});

export const markNotificationRead = (token, id) =>
  request(`/notifications/${id}/read`, {method: 'PATCH', token});

export const listSos = (token, params, options = {}) => request(`/sos${queryString(params)}`, {token, ...options});
export const getSos = (token, id, options = {}) => request(`/sos/${id}`, {token, ...options});
export const createSos = (token, body) => request('/sos', {method: 'POST', token, body});
export const cancelSos = (token, id) => request(`/sos/${id}/cancel`, {method: 'PATCH', token});
export const deactivateSos = (token, id) => request(`/sos/${id}/deactivate`, {method: 'PATCH', token});
export const deleteSos = (token, id) => request(`/sos/${id}`, {method: 'DELETE', token});
export const reportLocation = (token, id, body) => request(`/sos/${id}/location`, {method: 'POST', token, body});
export const reportSosMedia = (token, id, component, body) =>
  request(`/sos/${id}/media/${component}`, {method: 'PATCH', token, body});
export const reportSosService = (token, id, component, body) =>
  request(`/sos/${id}/service/${component}`, {method: 'PATCH', token, body});
export const uploadSosMedia = (token, id, component, file) => {
  const body = new FormData();
  body.append('file', file);
  return request(`/sos/${id}/media/${component}/upload`, {method: 'PATCH', token, body, timeoutMs: 90000});
};
export const startLiveLocation = (token, id) => request(`/sos/${id}/live-location/start`, {method: 'POST', token});
export const pingLiveLocation = (token, id, body) => request(`/sos/${id}/live-location/ping`, {method: 'POST', token, body});
export const stopLiveLocation = (token, id) => request(`/sos/${id}/live-location/stop`, {method: 'POST', token});
export const getLiveLocation = (token, id, params, options = {}) => request(`/sos/${id}/live-location${queryString(params)}`, {token, ...options});

export const listUsers = (token, params, options = {}) => request(`/users${queryString(params)}`, {token, ...options});
export const listContacts = token => request('/contacts', {token});
export const updateMyProfile = (token, body) => request('/users/me', {method: 'PATCH', token, body});
export const getUser = (token, id) => request(`/users/${id}`, {token});
export const createUser = (token, body) => request('/users', {method: 'POST', token, body});
export const updateUser = (token, id, body) => request(`/users/${id}`, {method: 'PATCH', token, body});
export const setUserPassword = (token, id, password) => request(`/users/${id}/password`, {method: 'PATCH', token, body: {password}});
export const setUserStatus = (token, id, active) => request(`/users/${id}/${active ? 'activate' : 'deactivate'}`, {method: 'PATCH', token});
export const deleteUser = (token, id) => request(`/users/${id}`, {method: 'DELETE', token});

export const listCollections = (token, params, options = {}) => request(`/collections${queryString(params)}`, {token, ...options});
export const getCollection = (token, id) => request(`/collections/${id}`, {token});
export const createCollection = (token, body) => request('/collections', {method: 'POST', token, body});
export const updateCollection = (token, id, body) => request(`/collections/${id}`, {method: 'PATCH', token, body});
export const listCollectionUsers = (token, id, params, options = {}) => request(`/collections/${id}/users${queryString(params)}`, {token, ...options});
