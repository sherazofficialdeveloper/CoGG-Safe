import {request} from '../api/client';

function resolveMessagingModule() {
  try {
    const firebaseMessaging = require('@react-native-firebase/messaging');
    if (!firebaseMessaging) {
      return null;
    }

    if (typeof firebaseMessaging.default === 'function') {
      return firebaseMessaging.default();
    }

    if (typeof firebaseMessaging === 'function') {
      return firebaseMessaging();
    }

    return null;
  } catch (error) {
    return null;
  }
}

function getPermissionStatusValue(status, messaging) {
  if (status === undefined || status === null) {
    return null;
  }

  if (typeof status === 'string') {
    return status.toUpperCase();
  }

  if (typeof status === 'number') {
    return status;
  }

  return null;
}

function isAuthorizedStatus(status, messaging) {
  const value = getPermissionStatusValue(status, messaging);
  if (value === null) {
    return false;
  }

  const authorizedValues = new Set([
    messaging?.AuthorizationStatus?.AUTHORIZED,
    messaging?.AuthorizationStatus?.PROVISIONAL,
    'AUTHORIZED',
    'PROVISIONAL',
    1,
    2,
  ]);

  return authorizedValues.has(value);
}

export function isFirebaseMessagingAvailable() {
  return !!resolveMessagingModule();
}

export async function requestFirebasePermission() {
  const messaging = resolveMessagingModule();
  if (!messaging) {
    return {status: 'unsupported', reason: 'Firebase messaging is not configured in this app build.'};
  }

  try {
    const hasPermission = typeof messaging.hasPermission === 'function' ? await messaging.hasPermission() : null;
    if (isAuthorizedStatus(hasPermission, messaging)) {
      return {status: 'granted'};
    }

    if (typeof messaging.requestPermission !== 'function') {
      return {status: 'granted'};
    }

    const granted = await messaging.requestPermission();
    const isGranted = isAuthorizedStatus(granted, messaging);
    return isGranted ? {status: 'granted'} : {status: 'denied', reason: 'Notification permission was denied.'};
  } catch (error) {
    return {status: 'error', reason: error?.message || 'Permission request failed.'};
  }
}

export async function registerDeviceToken(authToken) {
  if (!authToken) {
    return {status: 'skipped', reason: 'No authenticated session is available.'};
  }

  const messaging = resolveMessagingModule();
  if (!messaging) {
    return {status: 'unsupported', reason: 'Firebase messaging is not configured in this app build.'};
  }

  try {
    const permission = await requestFirebasePermission();
    if (permission.status === 'denied' || permission.status === 'error') {
      return permission;
    }

    if (typeof messaging.registerDeviceForRemoteMessages === 'function') {
      await messaging.registerDeviceForRemoteMessages();
    }

    const token = await (typeof messaging.getToken === 'function' ? messaging.getToken() : null);
    if (!token) {
      return {status: 'unavailable', reason: 'FCM token could not be acquired.'};
    }

    await request('/push-tokens', {
      method: 'POST',
      token: authToken,
      body: {
        token,
        platform: 'android',
      },
    });

    return {status: 'registered', token};
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      return {status: 'expired', reason: 'Session expired. Please log in again.'};
    }
    if (error?.message) {
      return {status: 'network-error', reason: error.message};
    }
    return {status: 'error', reason: 'Token registration failed.'};
  }
}

export async function unregisterDeviceToken(authToken, currentDeviceToken) {
  if (!authToken) {
    return {status: 'skipped', reason: 'No authenticated session is available.'};
  }

  const messaging = resolveMessagingModule();
  if (!messaging) {
    return {status: 'unsupported', reason: 'Firebase messaging is not configured in this app build.'};
  }

  try {
    const tokenToRemove = currentDeviceToken || await (typeof messaging.getToken === 'function' ? messaging.getToken().catch(() => null) : null);
    if (!tokenToRemove) {
      return {status: 'skipped', reason: 'No device token was available to unregister.'};
    }

    await request('/push-tokens', {
      method: 'DELETE',
      token: authToken,
      body: {token: tokenToRemove},
    });
    return {status: 'removed'};
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      return {status: 'expired', reason: 'Session expired. Please log in again.'};
    }
    return {status: 'error', reason: error?.message || 'Token removal failed.'};
  }
}

export function observeFirebaseNotifications({
  onForegroundMessage,
  onOpenedFromNotification,
  onBackgroundMessage,
  onTokenRefresh,
} = {}) {
  const messaging = resolveMessagingModule();
  if (!messaging) {
    return () => undefined;
  }

  const subscriptions = [];

  if (typeof messaging.onMessage === 'function') {
    subscriptions.push(messaging.onMessage(async remoteMessage => {
      if (onForegroundMessage) {
        onForegroundMessage(remoteMessage);
      }
    }));
  }

  if (typeof messaging.onNotificationOpenedApp === 'function') {
    subscriptions.push(messaging.onNotificationOpenedApp(remoteMessage => {
      if (onOpenedFromNotification) {
        onOpenedFromNotification(remoteMessage);
      }
    }));
  }

  if (typeof messaging.onTokenRefresh === 'function') {
    subscriptions.push(messaging.onTokenRefresh(async newToken => {
      if (onTokenRefresh) {
        onTokenRefresh(newToken);
      }
    }));
  }

  if (typeof messaging.getInitialNotification === 'function') {
    messaging.getInitialNotification()
      .then(initialNotification => {
        if (initialNotification && onOpenedFromNotification) {
          onOpenedFromNotification(initialNotification);
        }
      })
      .catch(() => undefined);
  }

  if (typeof messaging.setBackgroundMessageHandler === 'function' && onBackgroundMessage) {
    messaging.setBackgroundMessageHandler(async remoteMessage => {
      onBackgroundMessage(remoteMessage);
      return null;
    });
  }

  return () => {
    subscriptions.forEach(unsubscribe => {
      if (unsubscribe && typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  };
}
