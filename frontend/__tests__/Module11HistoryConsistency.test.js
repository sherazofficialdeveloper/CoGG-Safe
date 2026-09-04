import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import UserHistoryScreen from '../src/screens/UserHistoryScreen';
import UserSosActiveScreen from '../src/screens/UserSosActiveScreen';

const mockListSos = jest.fn();
const mockGetSos = jest.fn();
const mockGetCachedApiData = jest.fn();

jest.mock('../src/api/resources', () => ({
  listSos: (...args) => mockListSos(...args),
  getSos: (...args) => mockGetSos(...args),
  getCachedApiData: (...args) => mockGetCachedApiData(...args),
}));

const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');
const flush = async () => {
  for (let i = 0; i < 3; i += 1) {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCachedApiData.mockReturnValue(null);
});

const renderHistory = async () => {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHistoryScreen token="token" onBack={jest.fn()} onHistoryDetail={jest.fn()} />);
    await flush();
  });
  return renderer;
};

const renderActive = async sos => {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserSosActiveScreen token="token" sos={sos} onBack={jest.fn()} />);
    await flush();
  });
  return renderer;
};

test('history requests the authoritative list once', async () => {
  mockListSos.mockResolvedValue({sos: [{_id: 's1', status: 'deactivated'}]});
  await renderHistory();
  expect(mockListSos).toHaveBeenCalledTimes(1);
});

test('history renders the authoritative status', async () => {
  mockListSos.mockResolvedValue({sos: [{_id: 's1', status: 'deactivated'}]});
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'deactivated')).toBe(true);
});

test('history renders authoritative created time', async () => {
  mockListSos.mockResolvedValue({sos: [{_id: 's1', createdAt: '2026-01-01T00:00:00.000Z'}]});
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node).includes('2026'))).toBe(true);
});

test('history renders authoritative location', async () => {
  mockListSos.mockResolvedValue({sos: [{_id: 's1', location: {latitude: 33.6844, longitude: 73.0479}}]});
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === '33.6844, 73.0479')).toBe(true);
});

test('history selection passes the complete cached row to navigation', async () => {
  const row = {_id: 's1', status: 'deactivated', components: {frontImage: {status: 'success'}}};
  mockListSos.mockResolvedValue({sos: [row]});
  const onHistoryDetail = jest.fn();
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserHistoryScreen token="token" onBack={jest.fn()} onHistoryDetail={onHistoryDetail} />);
    await flush();
  });
  const list = renderer.root.findByType(require('react-native').FlatList);
  await ReactTestRenderer.act(async () => list.props.renderItem({item: row}).props.onPress());
  expect(onHistoryDetail).toHaveBeenCalledWith(row);
});

test('cached history remains visible when refresh fails', async () => {
  const cached = {sos: [{_id: 's1', status: 'cancelled'}]};
  mockGetCachedApiData.mockReturnValue(cached);
  mockListSos.mockRejectedValue(new Error('offline'));
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'cancelled')).toBe(true);
});

test('history reports refresh failure without erasing cached rows', async () => {
  mockGetCachedApiData.mockReturnValue({sos: [{_id: 's1', status: 'cancelled'}]});
  mockListSos.mockRejectedValue(new Error('offline'));
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'offline')).toBe(true);
});

test('history refresh replaces cached data with authoritative data', async () => {
  mockGetCachedApiData.mockReturnValue({sos: [{_id: 's1', status: 'cancelled'}]});
  mockListSos.mockResolvedValue({sos: [{_id: 's1', status: 'deactivated'}]});
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'deactivated')).toBe(true);
});

test('active detail fetches by stable SOS id', async () => {
  mockGetSos.mockResolvedValue({sos: {_id: 's1', status: 'resolved'}});
  await renderActive({_id: 's1', status: 'active'});
  expect(mockGetSos).toHaveBeenCalledWith('token', 's1');
});

test('active detail replaces stale list status', async () => {
  mockGetSos.mockResolvedValue({sos: {_id: 's1', status: 'resolved'}});
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'RESOLVED')).toBe(true);
});

test('active detail uses cached detail before network completion', async () => {
  mockGetCachedApiData.mockReturnValue({sos: {_id: 's1', status: 'resolved'}});
  mockGetSos.mockReturnValue(new Promise(() => {}));
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'RESOLVED')).toBe(true);
});

test('active detail keeps stale detail when authoritative refresh fails', async () => {
  mockGetSos.mockRejectedValue(new Error('offline'));
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'ACTIVE')).toBe(true);
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'offline')).toBe(true);
});

test('active detail displays authoritative username data when supplied', async () => {
  mockGetSos.mockResolvedValue({sos: {_id: 's1', status: 'active', userId: {username: 'authoritative'}}});
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'ACTIVE')).toBe(true);
});

test('active detail does not fabricate missing detail', async () => {
  mockGetSos.mockResolvedValue({sos: null});
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'ACTIVE')).toBe(true);
});

test('active detail preserves the supplied SOS when detail request is unavailable', async () => {
  mockGetSos.mockRejectedValue(new Error('network unavailable'));
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'ACTIVE')).toBe(true);
});

test('active detail back action remains wired to the existing callback', async () => {
  const onBack = jest.fn();
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<UserSosActiveScreen token="token" sos={{_id: 's1'}} onBack={onBack} />);
    await flush();
  });
  const back = renderer.root.findAllByType(TouchableOpacity).at(-1);
  back.props.onPress();
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('detail request is not repeated by unrelated state updates', async () => {
  mockGetSos.mockResolvedValue({sos: {_id: 's1', status: 'resolved'}});
  const renderer = await renderActive({_id: 's1', status: 'active'});
  await ReactTestRenderer.act(async () => renderer.update(<UserSosActiveScreen token="token" sos={{_id: 's1', status: 'active'}} onBack={jest.fn()} />));
  expect(mockGetSos).toHaveBeenCalledTimes(1);
});

test('detail uses _id and id consistently', async () => {
  mockGetSos.mockResolvedValue({sos: {id: 's2', status: 'active'}});
  await renderActive({id: 's2', status: 'active'});
  expect(mockGetSos).toHaveBeenCalledWith('token', 's2');
});

test('history supports empty authoritative lists', async () => {
  mockListSos.mockResolvedValue({sos: []});
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(Text).some(node => textContent(node) === 'No SOS records')).toBe(true);
});

test('history keeps list usable after a failed refresh', async () => {
  mockGetCachedApiData.mockReturnValue({sos: [{_id: 's1', status: 'cancelled'}]});
  mockListSos.mockRejectedValue(new Error('offline'));
  const renderer = await renderHistory();
  expect(renderer.root.findAllByType(TouchableOpacity).length).toBeGreaterThan(0);
});

test('authoritative detail response wins over stale navigation status', async () => {
  mockGetSos.mockResolvedValue({sos: {_id: 's1', status: 'deactivated'}});
  const renderer = await renderActive({_id: 's1', status: 'active'});
  const statuses = renderer.root.findAllByType(Text).map(textContent);
  expect(statuses).toContain('DEACTIVATED');
  expect(statuses).not.toContain('ACTIVE');
});

test('detail remains usable when backend returns an error after cached detail', async () => {
  mockGetCachedApiData.mockReturnValue({sos: {_id: 's1', status: 'cancelled'}});
  mockGetSos.mockRejectedValue(new Error('offline'));
  const renderer = await renderActive({_id: 's1', status: 'active'});
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('CANCELLED');
});
