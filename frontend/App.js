// App.js

import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  BackHandler,
} from 'react-native';

import {SafeAreaProvider} from 'react-native-safe-area-context';

// Context
import {AuthProvider, useAuth} from './src/context/AuthContext';

// Components
import Toast from './src/components/Toast';
import AppShell from './src/components/AppShell';
import AdminHeader from './src/components/AdminHeader';

// Screens
import LoginScreen from './src/screens/LoginScreen';

// User Screens
import UserHomeScreen from './src/screens/UserHomeScreen';
import UserSosActiveScreen from './src/screens/UserSosActiveScreen';
import UserContactsScreen from './src/screens/UserContactsScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import UserHistoryScreen from './src/screens/UserHistoryScreen';
import UserNotificationScreen from './src/screens/UserNotificationScreen';
import UserNotificationDetailScreen from './src/screens/UserNotificationDetailScreen';

// Admin Screens
import AdminDashboardScreen from './src/screens/admin/AdminDashboardScreen';
import AdminUsersScreen from './src/screens/admin/AdminUsersScreen';
import AdminUserDetailScreen from './src/screens/admin/AdminUserDetailScreen';
import AdminSosScreen from './src/screens/admin/AdminSosScreen';
import AdminSosDetailScreen from './src/screens/admin/AdminSosDetailScreen';
import AdminNotificationScreen from './src/screens/admin/AdminNotificationScreen';
import AdminProfileScreen from './src/screens/admin/AdminProfileScreen';
import AdminCollectionsScreen from './src/screens/admin/AdminCollectionsBackendScreen';
import AdminAddCollectionScreen from './src/screens/admin/AdminAddCollectionScreen';

// Bottom Navs
import UserBottomNav from './src/components/UserBottomNav';
import AdminBottomNav from './src/components/AdminBottomNav';

// API / SOS foundation
import {activateSosFlow} from './src/features/sos/orchestrator';

import {
  syncSosToBackend,
  syncSosLocation,
  uploadCapturedSosMedia,
} from './src/features/sos/services/backendSyncService';
import {getCurrentLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms, sendEmergencySmsToNumbers} from './src/features/sos/services/smsService';
import {initiateEmergencyCall} from './src/features/sos/services/callService';

import {
  startLiveLocationSharing,
  syncPendingLocationPings,
} from './src/features/sos/services/liveLocationService';

import {captureEmergencyPhotos} from './src/features/sos/services/cameraService';
import {recordEmergencyAudio} from './src/features/sos/services/audioService';
import {rememberCredential} from './src/utils/adminCredentials';

import {connectivityService} from './src/features/sos/connectivity';
import {processSosQueue} from './src/features/sos/queue/queueWorker';
import {recoverActiveSosWork} from './src/features/sos/recovery';
import {sosLocalStore} from './src/features/sos/storage';
import {
  observeFirebaseNotifications,
  registerDeviceToken,
  unregisterDeviceToken,
} from './src/services/firebasePush';

// ============================================================
// MAIN APP CONTENT
// ============================================================

function AppContent() {
  const {token, user, loading, signIn, signOut} = useAuth();

  const [screen, setScreen] = useState('loading');
  const [portal, setPortal] = useState('admin');
  const [selectedUser, setSelectedUser] = useState(null);
  const [adminCredentialMap, setAdminCredentialMap] = useState({});
  const [userDetailBackScreen, setUserDetailBackScreen] = useState('adminUsers');
  const [selectedSos, setSelectedSos] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState('');
  const [activeSosCount, setActiveSosCount] = useState(0);
  const [userNotificationCount, setUserNotificationCount] = useState(0);
  const [adminNotificationCount, setAdminNotificationCount] = useState(0);
  const [collectionCacheReadyKey, setCollectionCacheReadyKey] = useState(null);
  const collectionCacheSuccessRef = useRef(null);
  const sosCancelSignalRef = useRef({cancelled: false});

  // Toast State
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = useCallback((message, type = 'success') => {
    setToast({
      visible: true,
      message,
      type,
    });
  }, []);

  const hideToast = useCallback(() => {
    setToast(prev => ({
      ...prev,
      visible: false,
    }));
  }, []);

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (loading) {
      setScreen('loading');
      return;
    }

    if (!user) {
      setScreen('login');
      return;
    }

    setPortal(user.role === 'admin' ? 'admin' : 'user');
    if (user.role === 'admin') {
      setScreen('adminDashboard');
    } else {
      setScreen('userHome');
    }
  }, [user, loading]);

  const goToLogin = useCallback(async () => {
    if (token) {
      await unregisterDeviceToken(token).catch(() => undefined);
    }

    setScreen('login');
    setSelectedUser(null);
    setSelectedSos(null);
    setSelectedNotification(null);

    signOut();

    showToast('Logged out successfully.', 'info');
  }, [showToast, signOut, token]);

  const handleIncomingNotification = useCallback((remoteMessage, source = 'message') => {
    const title = remoteMessage?.notification?.title || remoteMessage?.data?.title || 'CoGG Safe update';
    const body = remoteMessage?.notification?.body || remoteMessage?.data?.body || 'You have a new notification.';

    if (user?.role === 'admin') {
      setPortal('admin');
      setScreen('adminNotifications');
    } else {
      setPortal('user');
      setScreen('userNotifications');
    }

    if (source === 'foreground') {
      showToast(body, 'info');
      return;
    }

    if (source === 'opened') {
      showToast(`${title}: ${body}`, 'info');
      return;
    }

    if (source === 'cold-start') {
      showToast(`${title}: ${body}`, 'info');
    }
  }, [showToast, user?.role]);

  // ============================================================
  // SOS QUEUE / RECOVERY / CONNECTIVITY
  // ============================================================

  useEffect(() => {
    connectivityService.setup();

    if (!token) {
      return undefined;
    }

    const processQueue = async () => {
      try {
        await processSosQueue({
          processors: {
            backend: async (item, event) =>
              syncSosToBackend({
                token,
                sosEvent: event,
                idempotencyKey: event.id,
              }),

            mediaUpload: async (item, event) =>
              uploadCapturedSosMedia({
                token,
                sosEvent: event,
                component: item.payload?.component || null,
              }),

            location: async (item, event) =>
              syncSosLocation({
               token,
               sosId: event.backendId,
               location: event.location,
              }),

            // Capture jobs are durable too.  A foreground capture can fail
            // transiently (or one camera can fail while the other succeeds);
            // retry the missing work using the persisted service result.
            camera: async (item, event) =>
              captureEmergencyPhotos({
                sosId: event.id,
                previousResult: event.services?.camera,
                event,
              }),

            audio: async (item, event) =>
              recordEmergencyAudio({sosId: event.id}),

            liveLocation: async (item, event) =>
              startLiveLocationSharing({
                token,
                sosId: event.id,
                backendId: event.backendId,
                startedAt: event.liveLocationStartedAt,
              }),

            sms: async (item, event) => sendEmergencySms({
              phoneNumber: event.meta?.emergencyNumber,
              message: `Emergency SOS ${event.id} for ${user?.username || 'user'}.`,
            }),

            linkSms: async (item, event) => {
              if (!event.emergencyLink) {
                return {status: 'WAITING_FOR_LINK', reason: 'Waiting for the backend emergency link.'};
              }
              return sendEmergencySmsToNumbers({
                phoneNumbers: [event.meta?.emergencyNumber],
                message: `Emergency assistance requested. Track the SOS here: ${event.emergencyLink}`,
                sosId: event.id,
                serviceKey: 'linkSms',
              });
            },

            call: async (item, event) => initiateEmergencyCall({
              emergencyNumber: event.meta?.emergencyNumber,
            }),
          },
        });

        const activeEvents = await sosLocalStore.getAllEvents();

        for (const active of activeEvents) {
          if (active.status === 'ACTIVE' && active.backendId) {
            await syncPendingLocationPings({
              token,
              sosId: active.id,
              backendId: active.backendId,
            }).catch(() => undefined);
          }
        }
      } catch (err) {
        // Safe fallback.
        // Individual queue failures must not crash the app.
      }
    };

    recoverActiveSosWork()
      .then(processQueue)
      .catch(() => processQueue());

    return connectivityService.subscribe(processQueue);
  }, [token, user?.username]);

  useEffect(() => {
    const collectionId = user?.collectionId;
    const cacheKey = token && collectionId ? `${token}:${collectionId}` : 'no-collection';
    const collection = user?.collection;

    if (!token || !collectionId) {
      collectionCacheSuccessRef.current = null;
      setCollectionCacheReadyKey(cacheKey);
      return undefined;
    }

    if (collectionCacheSuccessRef.current === cacheKey) {
      setCollectionCacheReadyKey(cacheKey);
      return undefined;
    }
    let active = true;
    setCollectionCacheReadyKey(null);
    setCollectionCacheReadyKey(null);

    Promise.resolve()
      .then(async () => {
        if (!active || !collection) return;
        await sosLocalStore.setCachedCollectionInfo(collectionId, collection);
        collectionCacheSuccessRef.current = cacheKey;
        setCollectionCacheReadyKey(cacheKey);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, user?.collectionId, user?.collection]);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    let active = true;
    let unsubscribe = () => undefined;

    const registerPushNotifications = async () => {
      const result = await registerDeviceToken(token);
      if (!active) {
        return;
      }

      if (result.status === 'expired') {
        setScreen('login');
        setSelectedUser(null);
        setSelectedSos(null);
        setSelectedNotification(null);
        signOut();
        showToast('Your session expired while registering device notifications.', 'info');
        return;
      }

      if (result.status === 'denied') {
        showToast('Notifications are disabled on this device.', 'info');
      }

      unsubscribe = observeFirebaseNotifications({
        onForegroundMessage: remoteMessage => handleIncomingNotification(remoteMessage, 'foreground'),
        onOpenedFromNotification: remoteMessage => handleIncomingNotification(remoteMessage, 'opened'),
        onBackgroundMessage: remoteMessage => handleIncomingNotification(remoteMessage, 'cold-start'),
        onTokenRefresh: async newToken => {
          if (!newToken || !token) {
            return;
          }

          const refreshResult = await registerDeviceToken(token);
          if (refreshResult.status === 'expired') {
            if (active) {
              showToast('Your session expired while refreshing device notifications.', 'info');
              setScreen('login');
              signOut();
            }
          }
        },
      });
    };

    registerPushNotifications();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [handleIncomingNotification, showToast, signOut, token, user]);

  // ============================================================
  // HANDLE ANDROID BACK BUTTON
  // ============================================================

  useEffect(() => {
    if (!user || user.role !== 'admin') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (screen !== 'adminDashboard' && screen.startsWith('admin')) {
          setScreen('adminDashboard');
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [screen, user]);

  // ============================================================
  // NAVIGATION FUNCTIONS
  // ============================================================

  // ============================================================
  // USER NAVIGATION
  // ============================================================

  const handleUserNavigation = tab => {
    switch (tab) {
      case 'Home':
        setScreen('userHome');
        break;

      case 'Contacts':
        setScreen('userContacts');
        break;

      case 'History':
        setScreen('userHistory');
        break;

      case 'Notifications':
        setScreen('userNotifications');
        break;

      case 'Profile':
        setScreen('userProfile');
        break;

      default:
        break;
    }
  };

  // ============================================================
  // ADMIN NAVIGATION
  // ============================================================

  const handleAdminNavigation = tab => {
    switch (tab) {
      case 'Dashboard':
        setScreen('adminDashboard');
        break;

      case 'Collections':
        setScreen('adminCollections');
        break;

      case 'SOS':
        setScreen('adminSos');
        break;

      case 'Notifications':
        setScreen('adminNotifications');
        break;

      case 'Profile':
        setScreen('adminProfile');
        break;

      default:
        break;
    }
  };

  // ============================================================
  // SOS HANDLER
  // ============================================================

  const handleTriggerSos = async () => {
    setSosError('');
    setSosLoading(true);
    sosCancelSignalRef.current = {cancelled: false};
    if (__DEV__) console.log('[SOS_DEBUG] TRIGGER_START', {timestamp: new Date().toISOString()});

    try {
      let collection = await sosLocalStore.getCachedCollectionInfo(user?.collectionId);
      if (collection?.collection) collection = collection.collection;
      const result = await activateSosFlow({
        userId: user?._id || user?.id,
        collectionId: user?.collectionId,
        countdownMs: 10000,
        cancelSignal: sosCancelSignalRef.current,
        onPending: async event => {
          setSelectedSos(event);
          setScreen('userSosActive');
          await sosLocalStore.upsertSos({
            ...event,
            meta: {
              ...event.meta,
              emergencyNumber: collection?.emergencyCallNumber || null,
            },
          });
          if (__DEV__) {
            console.log('[SOS_DEBUG] TRIGGER_ID', {localSosId: result?.event?.id || null});
            console.log('[SOS_DEBUG] IDEMPOTENCY_KEY', {key: result?.event?.id || null});
          }
        },

        serviceRunners: {
          // ------------------------------------------------------
          // SMS
          // ------------------------------------------------------
          sms: async event => {
            const location = await getCurrentLocation().catch(() => null);

            const message = location
              ? `Emergency assistance requested. Location: ${location.latitude}, ${location.longitude}`
              : 'Emergency assistance requested.';

            return sendEmergencySmsToNumbers({
              phoneNumbers: [collection?.emergencyCallNumber],
              message,
              sosId: event.id,
            });
          },

          // ------------------------------------------------------
          // EMERGENCY CALL
          // ------------------------------------------------------
          call: async () =>
            initiateEmergencyCall({
              emergencyNumber: collection?.emergencyCallNumber,
            }),

          // ------------------------------------------------------
          // CAMERA
          // ------------------------------------------------------
          camera: async event =>
            captureEmergencyPhotos({
              sosId: event.id,
              event,
            }),

          // ------------------------------------------------------
          // AUDIO
          // ------------------------------------------------------
          audio: async event =>
            recordEmergencyAudio({
              sosId: event.id,
              previousResult: event.services?.audio,
            }),

          // ------------------------------------------------------
          // LOCATION
          // ------------------------------------------------------
          location: async () => getCurrentLocation(),

          // ------------------------------------------------------
          // LIVE LOCATION
          // ------------------------------------------------------
          liveLocation: async event =>
            startLiveLocationSharing({
              token,
              sosId: event.id,
              backendId: event.backendId,
            }),

          // ------------------------------------------------------
          // BACKEND
          // ------------------------------------------------------
          backend: async event =>
            syncSosToBackend({
              token,
              sosEvent: event,
              idempotencyKey: event.id,
            }),

          // ------------------------------------------------------
          // EMAIL
          // ------------------------------------------------------
          email: async () => ({
            status: 'PENDING',
            reason: 'Email dispatch is handled by the backend after activation.',
          }),

          // ------------------------------------------------------
          // NOTIFICATIONS
          // ------------------------------------------------------
          notifications: async () => ({
            status: 'COMPLETED',
            reason: 'Notification dispatch is handled by the backend after activation.',
          }),
        },
      });

      if (result?.cancelled) {
        showToast('SOS cancelled before dispatch.', 'info');
      } else if (result?.event) {
        setSelectedSos(result.event);
        setScreen('userSosActive');

        showToast(
          'SOS alert triggered locally and queued for delivery.',
          'success',
        );
      }
    } catch (error) {
      const message =
        error?.message || 'Unable to trigger the SOS alert.';

      setSosError(message);

      showToast('Failed to trigger SOS', 'error');
    } finally {
      setSosLoading(false);
    }
  };

  // ============================================================
  // LOADING SCREEN
  // ============================================================

  const collectionCacheKey = token && user?.collectionId
    ? `${token}:${user.collectionId}`
    : 'no-collection';

  if (screen === 'loading' || loading || collectionCacheReadyKey !== collectionCacheKey) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E4002B" />

        <Text style={styles.loadingText}>
          Loading your secure session...
        </Text>
      </View>
    );
  }

  // ============================================================
  // LOGIN SCREEN
  // ============================================================

  if (screen === 'login' || !user) {
    return (
      <LoginScreen
        onLogin={(identifier, password, selectedRole) =>
          signIn(identifier, password, selectedRole)
        }
      />
    );
  }

  // ============================================================
  // USER SCREENS
  // ============================================================

  if (user?.role === 'user' || (user?.role === 'admin' && portal === 'user')) {
    const userCommonProps = {
      showNotification: true,

      onNotification: () => {
        setScreen('userNotifications');
      },

      notificationCount: userNotificationCount,

      showLogout: true,

      onLogout: goToLogin,
    };

    switch (screen) {
      // --------------------------------------------------------
      // USER HOME
      // --------------------------------------------------------
      case 'userHome':
        return (
          <AppShell
            {...userCommonProps}
            bottomNav={
              <UserBottomNav
                activeTab="Home"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserHomeScreen
              user={user}
              onSwitchToAdmin={user.role === 'admin' ? () => {
                setPortal('admin');
                setScreen('adminDashboard');
              } : undefined}
              onTriggerSos={handleTriggerSos}
              sosLoading={sosLoading}
              sosError={sosError}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER CONTACTS
      // --------------------------------------------------------
      case 'userContacts':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={
              <UserBottomNav
                activeTab="Contacts"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserContactsScreen
              token={token}
              onBack={() => setScreen('userHome')}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER PROFILE
      // --------------------------------------------------------
      case 'userProfile':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={
              <UserBottomNav
                activeTab="Profile"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserProfileScreen
              user={user}
              onLogout={goToLogin}
              onBack={() => setScreen('userHome')}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER HISTORY
      // --------------------------------------------------------
      case 'userHistory':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={
              <UserBottomNav
                activeTab="History"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserHistoryScreen
              token={token}
              onBack={() => setScreen('userHome')}
              onHistoryDetail={item => {
                setSelectedSos(item);
                setScreen('userSosDetail');
              }}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER NOTIFICATIONS
      // --------------------------------------------------------
      case 'userNotifications':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={
              <UserBottomNav
                activeTab="Notifications"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserNotificationScreen
              token={token}
              onNotificationDetail={notification => {
                setSelectedNotification(notification);
                setScreen('userNotificationDetail');
              }}
              onBadgeCountChange={count => setUserNotificationCount(count)}
              onBack={() => setScreen('userHome')}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER NOTIFICATION DETAIL
      // --------------------------------------------------------
      case 'userNotificationDetail':
        return (
          <AppShell
            showBack={true}
            onBack={() => setScreen('userNotifications')}
            showNotification={false}
            showLogout={false}>
            <UserNotificationDetailScreen
              notification={selectedNotification}
              onBack={() => setScreen('userNotifications')}
              onViewSos={sosId => {
                setSelectedSos({
                  id: sosId,
                });

                setScreen('userSosActive');
              }}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER ACTIVE SOS
      // --------------------------------------------------------
      case 'userSosActive':
        return (
          <AppShell
            showBack={true}
            onBack={() => setScreen('userHome')}
            hideLogo={true}
            showNotification={false}
            showLogout={false}>
            <UserSosActiveScreen
              token={token}
              sos={selectedSos}
              onBack={() => setScreen('userHome')}
              onCancelSos={() => {
                sosCancelSignalRef.current.cancelled = true;
                setScreen('userHome');
                showToast('SOS cancelled.', 'info');
              }}
              onViewContacts={() => setScreen('userContacts')}
            />
          </AppShell>
        );

      // --------------------------------------------------------
      // USER DEFAULT
      // --------------------------------------------------------
      default:
        return (
          <AppShell
            {...userCommonProps}
            bottomNav={
              <UserBottomNav
                activeTab="Home"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserHomeScreen
              user={user}
              onTriggerSos={handleTriggerSos}
              sosLoading={sosLoading}
              sosError={sosError}
            />
          </AppShell>
        );
    }
  }

  // ============================================================
  // ADMIN SCREENS
  // ============================================================

  if (user?.role === 'admin') {
    // ----------------------------------------------------------
    // ADMIN LAYOUT WITHOUT HEADER
    // ----------------------------------------------------------

    const AdminLayoutNoHeader = ({children, bottomNav}) => (
      <View style={styles.adminContainer}>
        <View style={styles.adminContent}>
          {children}
        </View>

        {bottomNav}
      </View>
    );

    // ----------------------------------------------------------
    // ADMIN LAYOUT WITH HEADER
    // Dashboard only
    // ----------------------------------------------------------

    const AdminLayoutWithHeader = ({children, bottomNav}) => (
      <View style={styles.adminContainer}>
        <AdminHeader
          user={user}
          onNotifications={() =>
            setScreen('adminNotifications')
          }
          onProfile={() => setScreen('adminProfile')}
          onLogout={goToLogin}
          activeSosCount={activeSosCount}
          onSwitchToUser={() => {
            setPortal('user');
            setScreen('userHome');
          }}
        />

        <View style={styles.adminContent}>
          {children}
        </View>

        {bottomNav}
      </View>
    );

    switch (screen) {
      // ========================================================
      // ADMIN DASHBOARD
      // ========================================================

      case 'adminDashboard':
        return (
          <AdminLayoutWithHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Dashboard"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminDashboardScreen
              token={token}
              user={user}
              onNavigate={handleAdminNavigation}
              onCollections={() =>
                setScreen('adminCollections')
              }
              onAddCollection={() =>
                setScreen('adminAddCollection')
              }
              onSos={() => setScreen('adminSos')}
              onNotifications={() =>
                setScreen('adminNotifications')
              }
              onProfile={() => setScreen('adminProfile')}
              onLogout={goToLogin}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
              onSosDetail={sos => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
            />
          </AdminLayoutWithHeader>
        );

      // ========================================================
      // ADMIN COLLECTIONS
      // ========================================================

      case 'adminCollections':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Collections"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminCollectionsScreen
              token={token}
              initialCredentials={adminCredentialMap}
              onCredentialRemember={(createdUser, password) => {
                setAdminCredentialMap(current => rememberCredential(current, createdUser, password));
              }}
              onAddCollection={() => setScreen('adminAddCollection')}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setUserDetailBackScreen('adminCollections');
                setScreen('adminUserDetail');
              }}
              onEditUser={userData => {
                setSelectedUser(userData);
                setUserDetailBackScreen('adminCollections');
                setScreen('adminUserDetailEdit');
              }}
              onNavigate={handleAdminNavigation}
              onBack={() => setScreen('adminDashboard')}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN ADD COLLECTION
      // ========================================================

      case 'adminAddCollection':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Dashboard"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminAddCollectionScreen
              token={token}
              onBack={() => setScreen('adminDashboard')}
              onSave={(collectionData, credentials) => {
                setAdminCredentialMap(credentials || {});
                showToast(
                  `Collection "${collectionData.name}" created!`,
                  'success',
                );

                setScreen('adminDashboard');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN USERS
      // ========================================================

      case 'adminUsers':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Users"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminUsersScreen
              token={token}
              currentAdmin={user}
              onNavigate={handleAdminNavigation}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
              onBack={() => setScreen('adminDashboard')}
              onProfile={() => setScreen('adminProfile')}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN USER DETAIL
      // ========================================================

      case 'adminUserDetail':
        return (
          <AdminLayoutNoHeader>
            <AdminUserDetailScreen
              token={token}
              user={selectedUser}
              onBack={() => setScreen(userDetailBackScreen)}
              onSosDetail={sos => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
            />
          </AdminLayoutNoHeader>
        );

      case 'adminUserDetailEdit':
        return (
          <AdminLayoutNoHeader>
            <AdminUserDetailScreen
              token={token}
              user={selectedUser}
              startEditing
              onBack={() => setScreen(userDetailBackScreen)}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN SOS
      // ========================================================

      case 'adminSos':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="SOS"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminSosScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onSosDetail={sos => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
              onBack={() => setScreen('adminDashboard')}
              onProfile={() => setScreen('adminProfile')}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN SOS DETAIL
      // ========================================================

      case 'adminSosDetail':
        return (
          <AdminLayoutNoHeader>
            <AdminSosDetailScreen
              token={token}
              sos={selectedSos}
              onBack={() => setScreen('adminSos')}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN NOTIFICATIONS
      // ========================================================

      case 'adminNotifications':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Notifications"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminNotificationScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onBack={() => setScreen('adminDashboard')}
              onNotificationPress={notification => {
                setSelectedNotification(notification);
                setScreen('adminNotificationDetail');
              }}
              onBadgeCountChange={count => setAdminNotificationCount(count)}
            />
          </AdminLayoutNoHeader>
        );

      case 'adminNotificationDetail':
        return (
          <AdminLayoutNoHeader>
            <UserNotificationDetailScreen
              token={token}
              notification={selectedNotification}
              onBack={() => setScreen('adminNotifications')}
              onViewSos={sosId => {
                setSelectedSos({id: sosId});
                setScreen('adminSosDetail');
              }}
            />
          </AdminLayoutNoHeader>
        );
 
      // ========================================================
      // ADMIN PROFILE
      // ========================================================

      case 'adminProfile':
        return (
          <AdminLayoutNoHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Profile"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminProfileScreen
              user={user}
              onNavigate={handleAdminNavigation}
              onLogout={goToLogin}
              onBack={() => setScreen('adminDashboard')}
            />
          </AdminLayoutNoHeader>
        );

      // ========================================================
      // ADMIN DEFAULT
      // ========================================================

      default:
        return (
          <AdminLayoutWithHeader
            bottomNav={
              <AdminBottomNav
                activeTab="Dashboard"
                onNavigate={handleAdminNavigation}
              />
            }>
            <AdminDashboardScreen
              token={token}
              user={user}
              onNavigate={handleAdminNavigation}
              onCollections={() =>
                setScreen('adminCollections')
              }
              onAddCollection={() =>
                setScreen('adminAddCollection')
              }
              onSos={() => setScreen('adminSos')}
              onNotifications={() =>
                setScreen('adminNotifications')
              }
              onProfile={() => setScreen('adminProfile')}
              onLogout={goToLogin}
            />
          </AdminLayoutWithHeader>
        );
    }
  }

  // ============================================================
  // FALLBACK
  // ============================================================

  return (
    <LoginScreen
      onLogin={(identifier, password, selectedRole) =>
        signIn(identifier, password, selectedRole)
      }
    />
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={styles.container}>
          <AppContent />
        </View>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8FA',
  },

  adminContainer: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  adminContent: {
    flex: 1,
  },

  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F8FA',
  },

  loadingText: {
    marginTop: 16,
    color: '#59636E',
    fontSize: 15,
    fontWeight: '500',
  },
});