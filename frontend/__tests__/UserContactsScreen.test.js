import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import UserContactsScreen from '../src/screens/UserContactsScreen';
import {listContacts} from '../src/api/resources';

jest.mock('../src/api/resources', () => ({
  listContacts: jest.fn(),
}));

describe('UserContactsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders collection members with safe contact fields and excludes current user semantics', async () => {
    listContacts.mockResolvedValue({
      contacts: [
        {_id: 'member-1', username: 'alice', mobileNumber: '03001234567', email: 'alice@example.com', status: 'active'},
        {_id: 'member-2', username: 'bob', mobileNumber: '03007654321', email: 'bob@example.com', status: 'inactive'},
      ],
    });

    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<UserContactsScreen token="abc" onBack={jest.fn()} />);
    });

    expect(listContacts).toHaveBeenCalledWith('abc');

    const textValues = renderer.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join('');
    expect(textValues).toContain('alice');
    expect(textValues).toContain('bob');
    expect(textValues).toContain('03001234567');
    expect(textValues).toContain('alice@example.com');
    expect(textValues).toContain('2');
  });

  test('shows the empty state when no other collection members exist', async () => {
    listContacts.mockResolvedValue({contacts: []});

    let renderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(<UserContactsScreen token="abc" onBack={jest.fn()} />);
    });

    const textValues = renderer.root.findAllByType(Text).map(node => node.props.children).flat(Infinity).join('');
    expect(textValues).toContain('No other users are assigned to your collection.');
  });
});
