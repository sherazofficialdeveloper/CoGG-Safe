import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Alert, Text, TouchableOpacity} from 'react-native';
import AdminSosDetailScreen from '../src/screens/admin/AdminSosDetailScreen';

const mockGetSos = jest.fn();
const mockDeactivateSos = jest.fn();
const mockGetLiveLocation = jest.fn();
const mockStopLiveLocation = jest.fn();

jest.mock('../src/api/resources', () => ({
  getSos: (...args) => mockGetSos(...args),
  deactivateSos: (...args) => mockDeactivateSos(...args),
  getLiveLocation: (...args) => mockGetLiveLocation(...args),
  stopLiveLocation: (...args) => mockStopLiveLocation(...args),
}));

const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');
const activeSos = (overrides = {}) => ({
  _id: 'sos-1',
  status: 'active',
  components: {
    frontImage: {status: 'success', storageRef: 'front'},
    backImage: {status: 'success', storageRef: 'back'},
    audio: {status: 'success', storageRef: 'audio'},
  },
  location: {latitude: 33.6844, longitude: 73.0479, accuracy: 5},
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSos.mockResolvedValue({sos: activeSos()});
  mockGetLiveLocation.mockResolvedValue({liveLocation: {status: 'inactive'}});
});

const renderDetail = async (sos = activeSos()) => {
  mockGetSos.mockResolvedValue({sos});
  mockGetLiveLocation.mockImplementation(() => Promise.resolve({
    liveLocation: mockDeactivateSos.mock.calls.length
      ? {status: 'stopped_sos_deactivated'}
      : (sos.liveLocation || {status: 'inactive'}),
  }));
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AdminSosDetailScreen sos={sos} token="admin-token" onBack={jest.fn()} />);
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  return renderer;
};

const resolveAction = () => {
  const alert = Alert.alert.mock.calls[0];
  const confirm = alert[2].find(action => action.text === 'Resolve');
  return confirm.onPress();
};

test('active SOS exposes one resolve action', async () => {
  const renderer = await renderDetail();
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('✓ Mark Resolved');
});

test('resolve action requires confirmation', async () => {
  const renderer = await renderDetail();
  const button = renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved')));
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  button.props.onPress();
  expect(Alert.alert).toHaveBeenCalledWith('Mark as Resolved', expect.any(String), expect.any(Array));
});

test('admin deactivate sends the authenticated token and stable id', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated'})});
  await ReactTestRenderer.act(async () => resolveAction());
  expect(mockDeactivateSos).toHaveBeenCalledWith('admin-token', 'sos-1');
});

test('successful deactivation updates the authoritative detail status', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated'})});
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('deactivated');
});

test('successful deactivation removes the repeatable resolve action', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated'})});
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('✓ Mark Resolved');
});

test('deactivation failure preserves ACTIVE status', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  mockDeactivateSos.mockRejectedValue(new Error('forbidden'));
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('active');
});

test.each([
  ['401', 'Unauthorized'],
  ['403', 'Forbidden'],
  ['404', 'Not found'],
  ['409', 'Conflict'],
  ['500', 'Server unavailable'],
  ['timeout', 'Request timed out'],
  ['offline', 'Unable to connect'],
])('deactivation %s keeps the action truthful', async (_name, message) => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  mockDeactivateSos.mockRejectedValue(new Error(message));
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('active');
});

test('double tap cannot issue two confirmations while loading', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const button = renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved')));
  button.props.onPress();
  let resolveDeactivate;
  mockDeactivateSos.mockReturnValue(new Promise(resolve => {resolveDeactivate = resolve;}));
  const firstAction = resolveAction();
  resolveAction();
  resolveDeactivate({sos: activeSos({status: 'deactivated'})});
  await ReactTestRenderer.act(async () => firstAction);
  expect(mockDeactivateSos).toHaveBeenCalledTimes(1);
});

test('deactivated input does not expose resolve action', async () => {
  const renderer = await renderDetail(activeSos({status: 'deactivated'}));
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('✓ Mark Resolved');
});

test('pending input does not expose resolve action', async () => {
  const renderer = await renderDetail(activeSos({status: 'pending'}));
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('✓ Mark Resolved');
});

test('cancelled input does not expose resolve action', async () => {
  const renderer = await renderDetail(activeSos({status: 'cancelled'}));
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('✓ Mark Resolved');
});

test('deactivated detail preserves front media mapping', async () => {
  const renderer = await renderDetail(activeSos({status: 'deactivated'}));
  expect(renderer.root.findAllByType(require('react-native').Image).length).toBe(2);
});

test('deactivated detail preserves back media mapping', async () => {
  const renderer = await renderDetail(activeSos({status: 'deactivated'}));
  expect(renderer.root.findAllByType(require('react-native').Image).map(item => item.props.source.uri)).toEqual([
    expect.stringContaining('frontImage'),
    expect.stringContaining('backImage'),
  ]);
});

test('deactivated detail preserves audio mapping', async () => {
  const renderer = await renderDetail(activeSos({status: 'deactivated'}));
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('Playback unavailable');
});

test('deactivated detail preserves location mapping', async () => {
  const renderer = await renderDetail(activeSos({status: 'deactivated'}));
  expect(renderer.root.findAllByType(Text).map(textContent).some(value => value.includes('33.6844'))).toBe(true);
});

test('active live location remains visible during deactivation', async () => {
  const renderer = await renderDetail(activeSos({liveLocation: {status: 'active'}}));
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('Stop Sharing');
});

test('deactivation response can confirm live location stopped', async () => {
  const renderer = await renderDetail(activeSos({liveLocation: {status: 'active'}}));
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated', liveLocation: {status: 'stopped_sos_deactivated'}})});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).not.toContain('Stop Sharing');
});

test('already stopped live location does not trigger an admin stop from deactivation', async () => {
  const renderer = await renderDetail(activeSos({liveLocation: {status: 'stopped_by_user'}}));
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated', liveLocation: {status: 'stopped_by_user'}})});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  await ReactTestRenderer.act(async () => resolveAction());
  expect(mockStopLiveLocation).not.toHaveBeenCalled();
});

test('detail always fetches authoritative data by id', async () => {
  await renderDetail(activeSos({_id: 'sos-authoritative'}));
  expect(mockGetSos).toHaveBeenCalledWith('admin-token', 'sos-authoritative');
});

test('stale GET cannot overwrite confirmed deactivation', async () => {
  let resolveGet;
  mockGetSos.mockReturnValue(new Promise(resolve => {resolveGet = resolve;}));
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated'})});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  await ReactTestRenderer.act(async () => resolveAction());
  await ReactTestRenderer.act(async () => resolveGet({sos: activeSos({status: 'active'})}));
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('deactivated');
});

test('deactivation does not delete the SOS detail', async () => {
  const renderer = await renderDetail();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockDeactivateSos.mockResolvedValue({sos: activeSos({status: 'deactivated'})});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  await ReactTestRenderer.act(async () => resolveAction());
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('SOS SERVICE RESULTS');
});

test('admin stop-live-location remains separate from deactivation', async () => {
  const renderer = await renderDetail(activeSos({liveLocation: {status: 'active'}}));
  expect(mockDeactivateSos).not.toHaveBeenCalled();
  expect(mockStopLiveLocation).not.toHaveBeenCalled();
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('Stop Sharing');
});

test('missing token does not send an admin deactivation request', async () => {
  const renderer = await renderDetail(activeSos());
  await ReactTestRenderer.act(async () => renderer.update(<AdminSosDetailScreen sos={activeSos()} />));
  expect(mockDeactivateSos).not.toHaveBeenCalled();
});

test('list/detail callback can receive the confirmed record', async () => {
  const onUpdated = jest.fn();
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<AdminSosDetailScreen sos={activeSos()} token="admin-token" onBack={jest.fn()} onUpdated={onUpdated} />);
    await Promise.resolve();
  });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const confirmed = activeSos({status: 'deactivated'});
  mockDeactivateSos.mockResolvedValue({sos: confirmed});
  renderer.root.findAllByType(TouchableOpacity).find(item => item.findAllByType(Text).some(node => textContent(node).includes('Mark Resolved'))).props.onPress();
  await ReactTestRenderer.act(async () => resolveAction());
  expect(onUpdated).toHaveBeenCalledWith(confirmed);
});
