import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import UserHomeScreen from '../src/screens/UserHomeScreen';
import {
  checkSosPermissions,
  createInitialSosPermissionState,
  openSosPermissionSettings,
  requestRequiredPermissions,
  subscribeToPermissionChanges,
} from '../src/permissions/sosPermissions';

jest.mock('../src/permissions/sosPermissions', () => ({
  checkSosPermissions: jest.fn(),
  createInitialSosPermissionState: jest.fn(),
  openSosPermissionSettings: jest.fn(),
  requestRequiredPermissions: jest.fn(),
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

test('SOS Home Allow Permissions requests native permissions and hides warning only after grant', async () => {
  requestRequiredPermissions.mockResolvedValue(grantedState);
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen />);
  });
  const allowButton = findButtonWithText(renderer, 'Allow Permissions');

  await ReactTestRenderer.act(async () => {
    await allowButton.props.onPress();
  });

  expect(requestRequiredPermissions).toHaveBeenCalledTimes(1);
  expect(openSosPermissionSettings).not.toHaveBeenCalled();
  expect(findButtonWithText(renderer, 'Allow Permissions')).toBeUndefined();
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

test('SOS Home Allow Permissions opens Settings after native blocked result', async () => {
  requestRequiredPermissions.mockResolvedValue({...deniedState, canRequest: false});
  let renderer;

  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen />);
  });
  const allowButton = findButtonWithText(renderer, 'Allow Permissions');

  await ReactTestRenderer.act(async () => {
    await allowButton.props.onPress();
  });

  expect(requestRequiredPermissions).toHaveBeenCalledTimes(1);
  expect(openSosPermissionSettings).toHaveBeenCalledTimes(1);
});
