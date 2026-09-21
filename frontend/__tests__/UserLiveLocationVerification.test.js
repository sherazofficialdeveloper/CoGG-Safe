import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import UserHomeScreen from '../src/screens/UserHomeScreen';

const mockListSos = jest.fn();
const mockStopLiveLocation = jest.fn();
const mockCheckSosPermissions = jest.fn();
const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');

jest.mock('../src/api/resources', () => ({
  listSos: (...args) => mockListSos(...args),
  stopLiveLocation: (...args) => mockStopLiveLocation(...args),
}));

jest.mock('../src/permissions/sosPermissions', () => ({
  checkSosPermissions: (...args) => mockCheckSosPermissions(...args),
  createInitialSosPermissionState: () => ({isChecking: false, allRequiredGranted: true, canRequest: false}),
  subscribeToPermissionChanges: () => jest.fn(),
  requestRequiredPermissions: jest.fn(),
  requestSosPermission: jest.fn(),
  openSosPermissionSettings: jest.fn(),
  SOS_TRIGGER_PERMISSIONS: [],
}));

const renderHome = async () => {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHomeScreen token="user-token" />);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
  return renderer;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCheckSosPermissions.mockResolvedValue({isChecking: false, allRequiredGranted: true, canRequest: false});
});

test('user shows Stop Sharing only after backend confirms active live location, then hides it after confirmed stop', async () => {
  mockListSos.mockResolvedValue({sos: [{id: 'sos-1', status: 'active', liveLocation: {status: 'active'}}]});
  mockStopLiveLocation.mockResolvedValue({sos: {liveLocation: {status: 'stopped_by_user'}}});
  const renderer = await renderHome();
  expect(mockListSos).toHaveBeenCalledWith('user-token', {status: 'active', limit: 10});
  expect(renderer.root.findAllByType(Text).map(node => textContent(node))).toEqual(expect.arrayContaining(['Stop Sharing']));

  let stopButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Stop Sharing'),
  );
  expect(stopButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    await stopButton.props.onPress();
  });
  expect(mockStopLiveLocation).toHaveBeenCalledWith('user-token', 'sos-1');
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'Stop Sharing')).toBe(false);
});

test.each([
  ['inactive', [{id: 'sos-1', status: 'active', liveLocation: {status: 'inactive'}}]],
  ['failed', [{id: 'sos-1', status: 'active', liveLocation: {status: 'failed'}}]],
  ['unknown', [{id: 'sos-1', status: 'active'}]],
])('user hides Stop Sharing for %s backend state', async (_state, sos) => {
  mockListSos.mockResolvedValue({sos});
  const renderer = await renderHome();
  expect(renderer.root.findAllByType(Text).some(node => node.children.join('') === 'Stop Sharing')).toBe(false);
});
