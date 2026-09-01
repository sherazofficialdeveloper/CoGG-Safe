import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import UserHomeScreen from '../src/screens/UserHomeScreen';
import {
  checkSosPermissions,
  createInitialSosPermissionState,
  openSosPermissionSettings,
  requestRequiredPermissions,
  requestSosPermission,
  REQUIRED_PERMISSIONS,
  subscribeToPermissionChanges,
} from '../src/permissions/sosPermissions';

jest.mock('../src/permissions/sosPermissions', () => ({
  checkSosPermissions: jest.fn(),
  createInitialSosPermissionState: jest.fn(),
  openSosPermissionSettings: jest.fn(),
  requestRequiredPermissions: jest.fn(),
  requestSosPermission: jest.fn(),
  REQUIRED_PERMISSIONS: [
    {key: 'location', title: 'Location', description: 'Location access is required.'},
    {key: 'camera', title: 'Camera', description: 'Camera access is required.'},
    {key: 'audio', title: 'Microphone', description: 'Microphone access is required.'},
    {key: 'call', title: 'Phone', description: 'Phone access is required.'},
    {key: 'notifications', title: 'Notifications', description: 'Notifications access is required.'},
  ],
  subscribeToPermissionChanges: jest.fn(() => jest.fn()),
}));

const deniedState = {
  location: 'denied',
  camera: 'denied',
  audio: 'denied',
  notifications: 'denied',
  allRequiredGranted: false,
  isChecking: false,
  canRequest: true,
};

const grantedState = {
  ...deniedState,
  location: 'granted',
  camera: 'granted',
  audio: 'granted',
  notifications: 'granted',
  allRequiredGranted: true,
};

function findButtonWithText(renderer, label) {
  const textNode = renderer.root.findAll(node => node.children?.join('') === label)[0];
  let current = textNode;
  while (current && typeof current.props?.onPress !== 'function') {
    current = current.parent;
  }
  return current;
}

beforeEach(() => {
  jest.clearAllMocks();
  createInitialSosPermissionState.mockReturnValue(deniedState);
  checkSosPermissions.mockResolvedValue(deniedState);
});

test('SOS Home individual Allow requests only the selected native permission and hides its warning after grant', async () => {
  requestSosPermission.mockResolvedValue(grantedState);
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen />);
  });
  const allowButton = findButtonWithText(renderer, 'Allow');

  await ReactTestRenderer.act(async () => {
    await allowButton.props.onPress();
  });

  expect(requestSosPermission).toHaveBeenCalledWith('location');
  expect(openSosPermissionSettings).not.toHaveBeenCalled();
  expect(renderer.root.findAll(node => node.children?.join('') === 'Location permission required')).toHaveLength(0);
});

test('SOS home hold starts immediately and triggers once after three seconds', async () => {
  jest.useFakeTimers();
  checkSosPermissions.mockResolvedValue(grantedState);
  const onTriggerSos = jest.fn();
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <UserHomeScreen onTriggerSos={onTriggerSos} />,
    );
  });

  const button = renderer.root.findAll(node => typeof node.props.onPressIn === 'function')[0];

  await ReactTestRenderer.act(async () => {
    button.props.onPressIn();
  });

  await ReactTestRenderer.act(async () => {
    jest.advanceTimersByTime(3100);
  });

  expect(onTriggerSos).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});

test('SOS Home individual blocked permission opens Settings', async () => {
  const blockedState = {...deniedState, location: 'never_ask_again', canRequest: false};
  createInitialSosPermissionState.mockReturnValue(blockedState);
  checkSosPermissions.mockResolvedValue(blockedState);
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen />);
  });
  const settingsButton = findButtonWithText(renderer, 'Open Settings');

  await ReactTestRenderer.act(async () => {
    await settingsButton.props.onPress();
  });

  expect(requestSosPermission).not.toHaveBeenCalled();
  expect(openSosPermissionSettings).toHaveBeenCalledTimes(1);
});

test('SOS home release before three seconds cancels the active hold', async () => {
  jest.useFakeTimers();
  checkSosPermissions.mockResolvedValue(grantedState);
  const onTriggerSos = jest.fn();
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen onTriggerSos={onTriggerSos} />);
  });

  const button = renderer.root.findAll(node => typeof node.props.onPressIn === 'function')[0];
  await ReactTestRenderer.act(async () => {
    button.props.onPressIn();
    jest.advanceTimersByTime(1500);
    button.props.onPressOut();
    jest.advanceTimersByTime(2000);
  });

  expect(onTriggerSos).not.toHaveBeenCalled();
  expect(renderer.root.findAll(node => node.children?.join('') === 'PRESS & HOLD')).toHaveLength(1);
  jest.useRealTimers();
});

test('SOS home ignores duplicate press-in events and activates once', async () => {
  jest.useFakeTimers();
  checkSosPermissions.mockResolvedValue(grantedState);
  const onTriggerSos = jest.fn();
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen onTriggerSos={onTriggerSos} />);
  });

  const button = renderer.root.findAll(node => typeof node.props.onPressIn === 'function')[0];
  await ReactTestRenderer.act(async () => {
    button.props.onPressIn();
    button.props.onPressIn();
    jest.advanceTimersByTime(3100);
    button.props.onPressIn();
  });

  expect(onTriggerSos).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});
test('SOS home ignores press-out after activation and clears its timer on unmount', async () => {
  jest.useFakeTimers();
  checkSosPermissions.mockResolvedValue(grantedState);
  const onTriggerSos = jest.fn();
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen onTriggerSos={onTriggerSos} />);
  });

  const button = renderer.root.findByProps({testID: 'home-sos-button'});
  await ReactTestRenderer.act(async () => {
    button.props.onPressIn();
    jest.advanceTimersByTime(3100);
    button.props.onPressOut();
  });
  expect(onTriggerSos).toHaveBeenCalledTimes(1);

  await ReactTestRenderer.act(async () => {
    renderer.unmount();
    jest.advanceTimersByTime(4000);
  });
  expect(onTriggerSos).toHaveBeenCalledTimes(1);
  jest.useRealTimers();
});