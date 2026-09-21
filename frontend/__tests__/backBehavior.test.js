import {getBackAction} from '../src/navigation/backBehavior';

describe('back behavior', () => {
  test('refreshes Home first and exits on the second press', () => {
    expect(getBackAction('userHome')).toEqual({handled: true, refreshHome: true});
    expect(getBackAction('userHome', {homeBackPressed: true})).toEqual({handled: false, exit: true});
  });

  test('returns from notification detail to its notification list', () => {
    expect(getBackAction('adminNotificationDetail')).toEqual({
      handled: true,
      nextScreen: 'adminNotifications',
    });
  });

  test('returns non-home screens to their existing parent', () => {
    expect(getBackAction('userContacts')).toEqual({handled: true, nextScreen: 'userHome'});
    expect(getBackAction('adminUserDetail', {userDetailBackScreen: 'adminCollections'})).toEqual({
      handled: true,
      nextScreen: 'adminCollections',
    });
  });
});
