import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import UserNotificationScreen from '../src/screens/UserNotificationScreen';
import {listNotifications} from '../src/api/resources';
import {getCachedApiData} from '../src/api/client';

jest.mock('../src/api/resources', () => ({
  listNotifications: jest.fn(),
  markNotificationRead: jest.fn(() => Promise.resolve()),
}));

jest.mock('../src/api/client', () => ({
  getCachedApiData: jest.fn(),
}));

describe('UserNotificationScreen state preservation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCachedApiData.mockReturnValue(null);
  });

  test('renders cached notifications immediately without a loading or empty state', async () => {
    const notifications = [{id: 'notification-1', title: 'SOS alert', body: 'Help', isRead: true}];
    getCachedApiData.mockReturnValue({notifications});
    listNotifications.mockResolvedValue({notifications});

    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <UserNotificationScreen token="token" onBack={jest.fn()} />,
      );
    });

    const text = renderer.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join('');
    expect(text).toContain('SOS alert');
    expect(text).not.toContain('No notifications');
    expect(text).not.toContain('Loading notifications');
  });
});
