import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AdminDashboardScreen from '../src/screens/admin/AdminDashboardScreen';
import StatCard from '../src/components/StatCard';

const mockListCollections = jest.fn();
const mockListUsers = jest.fn();
const mockListSos = jest.fn();

jest.mock('../src/api/resources', () => ({
  listCollections: (...args) => mockListCollections(...args),
  listUsers: (...args) => mockListUsers(...args),
  listSos: (...args) => mockListSos(...args),
}));

async function renderDashboard() {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{insets: {top: 0, right: 0, bottom: 0, left: 0}, frame: {x: 0, y: 0, width: 320, height: 640}}}>
        <AdminDashboardScreen token="admin-token" />
      </SafeAreaProvider>,
    );
    for (let attempt = 0; attempt < 5; attempt += 1) await Promise.resolve();
  });
  return renderer;
}

afterEach(() => jest.clearAllMocks());

test('maps real collection and user totals into five statistic cards', async () => {
  mockListCollections.mockResolvedValue({collections: [{_id: 'c1', name: 'Family', type: 'family', emergencyCallNumber: '15'}], meta: {total: 1}});
  mockListUsers
    .mockResolvedValueOnce({meta: {total: 7}, users: []})
    .mockResolvedValueOnce({meta: {total: 5}, users: []})
    .mockResolvedValueOnce({meta: {total: 2}, users: []});
  mockListSos.mockResolvedValue({sos: [], meta: {total: 3}});

  const renderer = await renderDashboard();
  const statCards = renderer.root.findAllByType(StatCard);

  expect(mockListCollections).toHaveBeenCalledWith('admin-token');
  expect(mockListUsers).toHaveBeenCalledWith('admin-token', {limit: 1});
  expect(mockListUsers).toHaveBeenCalledWith('admin-token', {limit: 1, status: 'active'});
  expect(mockListUsers).toHaveBeenCalledWith('admin-token', {limit: 1, status: 'inactive'});
  expect(mockListSos).toHaveBeenCalledWith('admin-token', {limit: 1});
  expect(statCards).toHaveLength(5);
  expect(statCards.map(card => card.props.value)).toEqual([7, 1, 5, 2, 3]);
});

test('shows the backend error and does not replace it with fake statistics', async () => {
  mockListCollections.mockRejectedValue(new Error('Dashboard request failed'));
  mockListUsers.mockResolvedValue({meta: {total: 0}, users: []});
  mockListSos.mockResolvedValue({sos: [], meta: {total: 0}});

  const renderer = await renderDashboard();
  const text = renderer.root.findAllByType(Text).map(node => JSON.stringify(node.props.children)).join(' ');

  expect(text).toContain('Dashboard request failed');
  expect(text).not.toContain('1,234');
});
