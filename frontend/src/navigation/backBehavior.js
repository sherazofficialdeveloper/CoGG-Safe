export function getBackAction(screen, {homeBackPressed = false, userDetailBackScreen = 'adminUsers'} = {}) {
  if (screen === 'userHome') {
    return homeBackPressed
      ? {handled: false, exit: true}
      : {handled: true, refreshHome: true};
  }

  if (screen === 'adminNotificationDetail') {
    return {handled: true, nextScreen: 'adminNotifications'};
  }

  if (screen === 'userNotificationDetail') {
    return {handled: true, nextScreen: 'userNotifications'};
  }

  if (screen.startsWith('admin') && screen !== 'adminDashboard') {
    return {
      handled: true,
      nextScreen: screen === 'adminUserDetail' ? userDetailBackScreen : 'adminDashboard',
    };
  }

  if (screen.startsWith('user') && screen !== 'userHome') {
    return {handled: true, nextScreen: 'userHome'};
  }

  return {handled: false, exit: true};
}
