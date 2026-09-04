import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Image, Text, TouchableOpacity} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import AdminSosDetailScreen from '../src/screens/admin/AdminSosDetailScreen';

const mockGetSos = jest.fn();
const mockGetLiveLocation = jest.fn();
const mockStopLiveLocation = jest.fn();
let mockAudioProps;
let mockViewerProps;
const textContent = node => node.children.map(child => typeof child === 'string' ? child : textContent(child)).join('');

jest.mock('../src/api/resources', () => ({
  getSos: (...args) => mockGetSos(...args),
  getLiveLocation: (...args) => mockGetLiveLocation(...args),
  stopLiveLocation: (...args) => mockStopLiveLocation(...args),
  deactivateSos: jest.fn(),
}));

jest.mock('../src/components/AudioPlayer', () => props => {
  mockAudioProps = props;
  return require('react').createElement('AudioPlayerBoundary', props);
});

jest.mock('../src/components/FullscreenImageViewer', () => props => {
  mockViewerProps = props;
  return require('react').createElement('FullscreenViewerBoundary', props);
});

const renderDetail = async sos => {
  let renderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider initialMetrics={{insets: {top: 0, right: 0, bottom: 0, left: 0}, frame: {x: 0, y: 0, width: 320, height: 640}}}>
        <AdminSosDetailScreen sos={sos} token="admin-token" onBack={jest.fn()} />
      </SafeAreaProvider>,
    );
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
  return renderer;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAudioProps = null;
  mockViewerProps = null;
  mockGetLiveLocation.mockResolvedValue({liveLocation: {status: 'inactive'}});
});

test('maps authoritative front and back media records to authenticated Image sources and fullscreen viewer', async () => {
  mockGetSos.mockResolvedValue({
    sos: {
      _id: 'backend-sos-1',
      status: 'active',
      components: {
        frontImage: {status: 'success', storageRef: 'sos/backend-sos-1/front.jpg'},
        backImage: {status: 'success', storageRef: 'sos/backend-sos-1/back.jpg'},
        audio: {status: 'success', storageRef: 'sos/backend-sos-1/audio.m4a'},
      },
      location: {status: 'success', latitude: 33.6844, longitude: 73.0479, accuracy: 8},
    },
  });
  const renderer = await renderDetail({_id: 'backend-sos-1', status: 'active'});

  const images = renderer.root.findAllByType(Image);
  expect(images).toHaveLength(2);
  expect(images.map(image => image.props.source.uri)).toEqual([
    expect.stringContaining('/sos/backend-sos-1/media/frontImage/file'),
    expect.stringContaining('/sos/backend-sos-1/media/backImage/file'),
  ]);
  expect(images.every(image => image.props.source.headers.Authorization === 'Bearer admin-token')).toBe(true);

  const frontImage = images.find(image => image.props.source.uri.includes('/media/frontImage/'));
  const frontTouchable = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Image).includes(frontImage),
  );
  await ReactTestRenderer.act(async () => {
    frontTouchable.props.onPress();
  });
  expect(mockViewerProps.uri).toBe(frontImage.props.source.uri);
  expect(mockViewerProps.headers.Authorization).toBe('Bearer admin-token');
});

test('renders authoritative location and passes valid stored audio to AudioPlayer', async () => {
  mockGetSos.mockResolvedValue({
    sos: {
      _id: 'backend-sos-location',
      status: 'active',
      components: {audio: {status: 'success', storageRef: 'sos/backend-sos-location/audio.m4a'}},
      location: {status: 'success', latitude: 33.6844, longitude: 73.0479, accuracy: 8},
    },
  });
  const renderer = await renderDetail({_id: 'backend-sos-location', status: 'active'});

  expect(renderer.root.findAllByType(Text).some(node => textContent(node).includes('33.6844'))).toBe(true);
  expect(mockAudioProps.audioUrl).toEqual(expect.stringContaining('/sos/backend-sos-location/media/audio/file'));
  expect(mockAudioProps.token).toBe('admin-token');
});

test('shows Stop Sharing only for authoritative active live-location state and hides it after confirmed stop', async () => {
  mockGetSos.mockResolvedValue({
    sos: {
      _id: 'backend-sos-live',
      status: 'active',
      liveLocation: {status: 'active', lastLocation: {latitude: 33, longitude: 73, capturedAt: new Date().toISOString()}},
    },
  });
  mockGetLiveLocation.mockResolvedValue({liveLocation: {status: 'active', lastLocation: {latitude: 33, longitude: 73, capturedAt: new Date().toISOString()}}});
  mockStopLiveLocation.mockResolvedValue({sos: {liveLocation: {status: 'stopped_by_user'}}});
  const renderer = await renderDetail({_id: 'backend-sos-live', status: 'active'});

  let stopButton = renderer.root.findAllByType(TouchableOpacity).find(button =>
    button.findAllByType(Text).some(node => textContent(node) === 'Stop Sharing'),
  );
  expect(stopButton).toBeDefined();
  await ReactTestRenderer.act(async () => {
    await stopButton.props.onPress();
  });
  expect(mockStopLiveLocation).toHaveBeenCalledWith('admin-token', 'backend-sos-live');
});
