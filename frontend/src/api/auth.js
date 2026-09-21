import {request} from './client';

export const login = (identifier, password, selectedRole) =>
  request('/auth/login', {
    method: 'POST',
    body: {
      identifier,
      password,
      ...(selectedRole ? {role: selectedRole} : {}),
    },
  });

export const getCurrentUser = token => request('/auth/me', {token});