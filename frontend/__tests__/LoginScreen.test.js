import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {TextInput, TouchableOpacity} from 'react-native';
import LoginScreen from '../src/screens/LoginScreen';

function textContent(node) {
  return node
    .findAllByType('Text')
    .map(item => item.children.join(''))
    .join(' ');
}

function renderLogin(onLogin = jest.fn(() => Promise.resolve())) {
  let renderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(<LoginScreen onLogin={onLogin} />);
  });
  return renderer;
}

test('defaults to User mode and renders the authentication form', () => {
  const renderer = renderLogin();
  const buttons = renderer.root.findAllByType(TouchableOpacity);

  expect(renderer.root.findAllByType(TextInput)).toHaveLength(2);
  expect(buttons[0].props.accessibilityState.selected).toBe(true);
  expect(textContent(renderer.root)).toContain('Log In');
});

test('supports selecting Admin mode', () => {
  const renderer = renderLogin();
  const buttons = renderer.root.findAllByType(TouchableOpacity);

  ReactTestRenderer.act(() => buttons[1].props.onPress());

  expect(buttons[1].props.accessibilityState.selected).toBe(true);
  expect(textContent(renderer.root)).toContain('ADMIN USERNAME');
});

test('validates required fields before making a request', async () => {
  const onLogin = jest.fn();
  const renderer = renderLogin(onLogin);
  const loginButton = renderer.root.findAllByType(TouchableOpacity)[3];

  await ReactTestRenderer.act(async () => {
    await loginButton.props.onPress();
  });

  expect(onLogin).not.toHaveBeenCalled();
  expect(textContent(renderer.root)).toContain('Enter your username or email');
});

test('prevents duplicate submissions while login is pending', async () => {
  let resolveLogin;
  const onLogin = jest.fn(
    () => new Promise(resolve => {
      resolveLogin = resolve;
    }),
  );
  const renderer = renderLogin(onLogin);
  const inputs = renderer.root.findAllByType(TextInput);

  ReactTestRenderer.act(() => {
    inputs[0].props.onChangeText('user123');
    inputs[1].props.onChangeText('password');
  });

  const loginButton = renderer.root.findAllByType(TouchableOpacity)[3];
  await ReactTestRenderer.act(async () => {
    loginButton.props.onPress();
    await Promise.resolve();
  });

  expect(renderer.root.findAllByType(TouchableOpacity)[3].props.disabled).toBe(true);
  expect(onLogin).toHaveBeenCalledTimes(1);

  expect(renderer.root.findAllByType(TouchableOpacity)[3].props.onPress).toBeDefined();
  expect(onLogin).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => resolveLogin());
});

test('shows safe network errors', async () => {
  const error = Object.assign(new Error('backend detail'), {status: 0});
  const renderer = renderLogin(() => Promise.reject(error));
  const inputs = renderer.root.findAllByType(TextInput);

  ReactTestRenderer.act(() => {
    inputs[0].props.onChangeText('user123');
    inputs[1].props.onChangeText('password');
  });

  const loginButton = renderer.root.findAllByType(TouchableOpacity)[3];
  await ReactTestRenderer.act(async () => {
    loginButton.props.onPress();
    await Promise.resolve();
  });

  expect(textContent(renderer.root)).toContain('Unable to connect');
  expect(textContent(renderer.root)).not.toContain('backend detail');
});