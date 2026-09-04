import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text, TouchableOpacity} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

const reactNative = require('react-native');
const mockClipboardSetString = jest.fn();
Object.defineProperty(reactNative, 'Clipboard', {
  configurable: true,
  value: {setString: mockClipboardSetString},
});
const AdminCollectionsBackendScreen = require('../src/screens/admin/AdminCollectionsBackendScreen').default;
const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');

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

test('has exactly one combined Copy button and copies the in-memory username and password together', async () => {
  const collection = {_id: 'collection-1', name: 'Family', type: 'family', emergencyCallNumber: '15'};
  mockListCollections.mockResolvedValue({collections: [collection]});
  mockListCollectionUsers.mockResolvedValue({users: [{_id: 'user-1', username: 'member1', mobileNumber: '03001234567', status: 'active'}]});
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{insets: {top: 0, right: 0, bottom: 0, left: 0}, frame: {x: 0, y: 0, width: 320, height: 640}}}>
        <AdminCollectionsBackendScreen
          token="admin-token"
          initialCredentials={{'user-1': 'secret-password'}}
          onBack={jest.fn()}
          onAddCollection={jest.fn()}
        />
      </SafeAreaProvider>,
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });

  const collectionButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Family'),
  );
  expect(mockListCollections).toHaveBeenCalled();
  await ReactTestRenderer.act(async () => {
    await collectionButton.props.onPress();
    await Promise.resolve();
  });

  const copyLabels = renderer.root.findAllByType(Text).filter(node => textContent(node) === 'Copy');
  expect(copyLabels).toHaveLength(1);
  const copyButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Copy'),
  );
  await ReactTestRenderer.act(async () => {
    await copyButton.props.onPress();
  });

  expect(mockClipboardSetString).toHaveBeenCalledWith('member1\nsecret-password');
  expect(mockClipboardSetString).toHaveBeenCalledTimes(1);
});

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
