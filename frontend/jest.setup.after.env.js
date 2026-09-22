/* global jest */

// Mock react-native-fs for Jest - production uses real module via Babel transform
jest.mock('react-native-fs', () => ({
  __esModule: true,
  default: {
    exists: jest.fn(() => Promise.resolve(true)),
    readFile: jest.fn(() => Promise.resolve('')),
    writeFile: jest.fn(() => Promise.resolve()),
    deleteFile: jest.fn(() => Promise.resolve()),
    mkdir: jest.fn(() => Promise.resolve()),
    readDir: jest.fn(() => Promise.resolve([])),
    stat: jest.fn(() => Promise.resolve({size: 0})),
    downloadFile: jest.fn(() => Promise.resolve({})),
    moveFile: jest.fn(() => Promise.resolve()),
    copyFile: jest.fn(() => Promise.resolve()),
    unlink: jest.fn(() => Promise.resolve()),
    appendFile: jest.fn(() => Promise.resolve()),
    RNFSVolume: {},
    READONLY: 0,
    WRITEONLY: 0,
    APPENDONLY: 0,
    Desktop: '',
    Documents: '',
    Library: '',
    Caches: '',
    tmp: '',
    MainBundle: '',
  },
}));

// Mock react-native-maps for Jest - production uses real module via Babel transform
jest.mock('react-native-maps', () => {
  const React = require('react');
  const {View} = require('react-native');
  const MapView = props => React.createElement(View, props);
  return {__esModule: true, default: MapView, MapView, Marker: View, Circle: View, PROVIDER_GOOGLE: 'google'};
});

// Mock react-native-track-player for Jest
jest.mock('react-native-track-player', () => ({
  Capability: {},
  State: {},
  usePlaybackState: () => ({}),
  useProgress: () => ({position: 0, duration: 0, buffered: 0}),
  TrackPlayer: {},
}));

// Mock react-native-vector-icons for Jest
jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');
jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'MaterialCommunityIcons');
