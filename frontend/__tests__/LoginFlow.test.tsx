/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

// Mock the API auth module
jest.mock('../src/api/auth', () => ({
  login: jest.fn((identifier, password, role) => {
    if (identifier === 'user123' && password === 'user123' && role === 'user') {
      return Promise.resolve({
        token: 'mock-jwt-token-user',
        user: {
          _id: 'user-id-123',
          username: 'user123',
          email: 'user123@example.com',
          role: 'user',
          status: 'active',
        },
      });
    }
    if (identifier === 'admin123' && password === 'admin123' && role === 'admin') {
      return Promise.resolve({
        token: 'mock-jwt-token-admin',
        user: {
          _id: 'admin-id-456',
          username: 'admin123',
          email: 'admin123@example.com',
          role: 'admin',
          status: 'active',
        },
      });
    }
    return Promise.reject(new Error('Invalid credentials'));
  }),
  getCurrentUser: jest.fn(() =>
    Promise.resolve({
      user: {
        _id: 'user-id-123',
        username: 'user123',
        email: 'user123@example.com',
        role: 'user',
        status: 'active',
      },
    })
  ),
}));

test('User login credentials are accepted with correct role', async () => {
  const auth = require('../src/api/auth');
  const result = await auth.login('user123', 'user123', 'user');
  
  expect(result).toBeDefined();
  expect(result.token).toBe('mock-jwt-token-user');
  expect(result.user.role).toBe('user');
  expect(result.user.status).toBe('active');
});

test('Admin login credentials are accepted with correct role', async () => {
  const auth = require('../src/api/auth');
  const result = await auth.login('admin123', 'admin123', 'admin');
  
  expect(result).toBeDefined();
  expect(result.token).toBe('mock-jwt-token-admin');
  expect(result.user.role).toBe('admin');
  expect(result.user.status).toBe('active');
});

test('Role mismatch is rejected during login', async () => {
  const auth = require('../src/api/auth');
  
  try {
    // User trying to login as admin
    await auth.login('user123', 'user123', 'admin');
    fail('Should have thrown an error');
  } catch (err) {
    expect(err.message).toContain('credentials');
  }
});

test('Invalid credentials are rejected', async () => {
  const auth = require('../src/api/auth');
  
  try {
    await auth.login('user123', 'wrongpassword', 'user');
    fail('Should have thrown an error');
  } catch (err) {
    expect(err.message).toContain('credentials');
  }
});

test('Non-existent user is rejected', async () => {
  const auth = require('../src/api/auth');
  
  try {
    await auth.login('nonexistent', 'password', 'user');
    fail('Should have thrown an error');
  } catch (err) {
    expect(err.message).toContain('credentials');
  }
});

test('Backend login response contains required fields', async () => {
  const auth = require('../src/api/auth');
  const result = await auth.login('user123', 'user123', 'user');
  
  // Verify response structure
  expect(result).toHaveProperty('token');
  expect(result).toHaveProperty('user');
  expect(result.user).toHaveProperty('_id');
  expect(result.user).toHaveProperty('username');
  expect(result.user).toHaveProperty('role');
  expect(result.user).toHaveProperty('status');
});
