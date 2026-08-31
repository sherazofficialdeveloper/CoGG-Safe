import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AdminCollectionsBackendScreen from '../src/screens/admin/AdminCollectionsBackendScreen';

const mockListCollections = jest.fn();
const mockListCollectionUsers = jest.fn();
const mockCreateUser = jest.fn();

jest.mock('../src/api/resources', () => ({
  listCollections: (...args) => mockListCollections(...args),
  listCollectionUsers: (...args) => mockListCollectionUsers(...args),
  createUser: (...args) => mockCreateUser(...args),
}));

const renderScreen = async () => {
  let renderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{insets: {top: 0, right: 0, bottom: 0, left: 0}, frame: {x: 0, y: 0, width: 320, height: 640}}}>
        <AdminCollectionsBackendScreen token="admin-token" onBack={jest.fn()} onAddCollection={jest.fn()} />
      </SafeAreaProvider>,
    );
  });
  await ReactTestRenderer.act(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await Promise.resolve();
    }
  });
  return renderer;
};

afterEach(() => jest.clearAllMocks());

test('renders an empty state from an empty backend collection response', async () => {
  mockListCollections.mockResolvedValue({collections: []});
  const renderer = await renderScreen();

  expect(mockListCollections).toHaveBeenCalledWith('admin-token');
  expect(renderer.root.findAllByType(Text).length).toBeGreaterThan(0);
});

test('loads real collections and their members', async () => {
  const collection = {_id: 'collection-1', name: 'Family', type: 'family', emergencyCallNumber: '15'};
  mockListCollections.mockResolvedValue({collections: [collection]});
  mockListCollectionUsers.mockResolvedValue({users: [{_id: 'user-1', username: 'member1', mobileNumber: '03001234567', status: 'active'}]});
  const renderer = await renderScreen();

  expect(mockListCollections).toHaveBeenCalledWith('admin-token');
  expect(renderer.root.findAllByType(TouchableOpacity).length).toBeGreaterThan(0);
});
