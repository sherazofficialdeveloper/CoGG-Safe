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
const {clearCollectionSnapshots} = require('../src/screens/admin/AdminCollectionsBackendScreen');
const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');

const mockListCollections = jest.fn();
const mockListCollectionUsers = jest.fn();
const mockCreateUser = jest.fn();
const mockUpdateUser = jest.fn();

jest.mock('../src/api/resources', () => ({
  listCollections: (...args) => mockListCollections(...args),
  listCollectionUsers: (...args) => mockListCollectionUsers(...args),
  createUser: (...args) => mockCreateUser(...args),
  updateUser: (...args) => mockUpdateUser(...args),
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

afterEach(() => {
  jest.clearAllMocks();
  clearCollectionSnapshots();
});

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

test('Edit reuses the inline user form without a password field and updates the existing user', async () => {
  const collection = {_id: 'collection-1', name: 'Family', type: 'family', emergencyCallNumber: '15'};
  const member = {_id: 'user-1', username: 'member1', mobileNumber: '03001234567', email: 'old@example.com', status: 'active'};
  mockListCollections.mockResolvedValue({collections: [collection]});
  mockListCollectionUsers.mockResolvedValue({users: [member]});
  mockUpdateUser.mockResolvedValue({user: {...member, username: 'updated'}});
  const renderer = await renderScreen();
  const collectionButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Family'),
  );
  await ReactTestRenderer.act(async () => collectionButton.props.onPress());
  const editButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Edit'),
  );
  await ReactTestRenderer.act(async () => editButton.props.onPress());
  expect(renderer.root.findAllByType(Text).map(textContent)).toContain('Edit user');
  expect(renderer.root.findAllByType(require('react-native').TextInput).map(input => input.props.value)).toEqual([
    'member1',
    '03001234567',
    'old@example.com',
  ]);
  expect(renderer.root.findAllByType(require('react-native').TextInput).some(input => input.props.placeholder === 'Password *')).toBe(false);
  const inputs = renderer.root.findAllByType(require('react-native').TextInput);
  await ReactTestRenderer.act(async () => inputs[0].props.onChangeText('updated'));
  const saveButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Save changes'),
  );
  await ReactTestRenderer.act(async () => saveButton.props.onPress());
  expect(mockUpdateUser).toHaveBeenCalledWith('admin-token', 'user-1', {
    username: 'updated',
    mobileNumber: '03001234567',
    email: 'old@example.com',
  });
  expect(mockCreateUser).not.toHaveBeenCalled();
});
