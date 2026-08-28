// App.js

import React, {useEffect, useRef, useState} from 'react';

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
import PermissionOnboardingScreen from './src/screens/PermissionOnboardingScreen';
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
  uploadCapturedSosMedia,
} from './src/features/sos/services/backendSyncService';
import {getCollection, getSos, reportLocation, reportMedia, reportSosService} from './src/api/resources';

import {getCurrentLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms} from './src/features/sos/services/smsService';
import {initiateEmergencyCall} from './src/features/sos/services/callService';

import {
  startLiveLocationSharing,
  syncPendingLocationPings,
} from './src/features/sos/services/liveLocationService';

import {captureEmergencyPhotos} from './src/features/sos/services/cameraService';
import {recordEmergencyAudio} from './src/features/sos/services/audioService';

import {connectivityService} from './src/features/sos/connectivity';
import {processSosQueue} from './src/features/sos/queue/queueWorker';
import {recoverActiveSosWork} from './src/features/sos/recovery';
import {sosLocalStore} from './src/features/sos/storage';
import {shouldShowPermissionOnboarding} from './src/permissions/sosPermissions';

// ============================================================
// MAIN APP CONTENT
// ============================================================

function AppContent() {
  const {token, user, loading, signIn, signOut, updateUser} = useAuth();
  const userId = user?._id || user?.id;
  const userRole = user?.role;

  const [screen, setScreen] = useState('loading');
  const [portal, setPortal] = useState('admin');
  const [addCollectionBackScreen, setAddCollectionBackScreen] = useState('adminDashboard');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetailBackScreen, setUserDetailBackScreen] = useState('adminUsers');
  const [selectedSos, setSelectedSos] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState('');
  const [activeSosCount, setActiveSosCount] = useState(0);
  const sosCancelSignalRef = useRef({cancelled: false});
  const sosInFlightRef = useRef(false);

  // Toast State
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message, type = 'success') => {
    setToast({
      visible: true,
      message,
      type,
    });
  };

  const hideToast = () => {
    setToast(prev => ({
      ...prev,
      visible: false,
    }));
  };

  // ============================================================
  // EFFECTS
  // ============================================================

  useEffect(() => {
    if (loading) {
      setScreen('loading');
      return;
    }

    if (!userId) {
      setScreen('login');
      return;
    }

    let mounted = true;
    setPortal(userRole === 'admin' ? 'admin' : 'user');
    if (userRole === 'admin') {
      setScreen('adminDashboard');
      return () => { mounted = false; };
    }
    setScreen('loading');
    shouldShowPermissionOnboarding().then(showOnboarding => {
      if (mounted) setScreen(showOnboarding ? 'permissionOnboarding' : 'userHome');
    });
    return () => { mounted = false; };
  }, [userId, userRole, loading]);

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
              }),

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
        if (screen === 'adminUserDetail') {
          setScreen(userDetailBackScreen);
          return true;
        }
        if (screen === 'adminSosDetail') {
          setScreen('adminSos');
          return true;
        }
        if (screen === 'adminAddCollection') {
          setScreen('adminCollections');
          return true;
        }
        if (screen === 'adminCollections') {
          setScreen('adminDashboard');
          return true;
        }

        return false;
      },
    );

    return () => subscription.remove();
  }, [screen, user, userDetailBackScreen]);

  // ============================================================
  // NAVIGATION FUNCTIONS
  // ============================================================

  const goToLogin = () => {
    setScreen('login');
    setSelectedUser(null);
    setSelectedSos(null);
    setSelectedNotification(null);

    signOut();

    showToast('Logged out successfully.', 'info');
  };

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
    if (sosInFlightRef.current) return;
    sosInFlightRef.current = true;
    setSosError('');
    setSosLoading(true);
    sosCancelSignalRef.current = {cancelled: false};

    try {
      let collection = null;
      const result = await activateSosFlow({
        userId: user?._id || user?.id,
        collectionId: user?.collectionId,
        countdownMs: 10000,
        cancelSignal: sosCancelSignalRef.current,
        onPending: event => {
          setSelectedSos(event);
          setScreen('userSosActive');
          getCollection(token, user?.collectionId)
            .then(collectionResponse => {
              collection = collectionResponse.collection;
              sosLocalStore.upsertSos({
                ...event,
                meta: {
                  ...event.meta,
                  emergencyNumber: collection.emergencyCallNumber,
                },
              });
            })
            .catch(() => undefined);
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

            return sendEmergencySms({
              phoneNumber: collection?.emergencyCallNumber,
              message,
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
            }),

          // ------------------------------------------------------
          // AUDIO
          // ------------------------------------------------------
          audio: async event =>
            recordEmergencyAudio({
              sosId: event.id,
            }),

          // ------------------------------------------------------
          // LOCATION
          // ------------------------------------------------------
          location: async event => {
            const location = await getCurrentLocation();
            if (event.backendId && location?.latitude != null && location?.longitude != null) {
              await reportLocation(token, event.backendId, location);
            }
            return location;
          },

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
            reason: 'Email dispatch is handled by the backend after synchronization.',
          }),

          // ------------------------------------------------------
          // NOTIFICATIONS
          // ------------------------------------------------------
          notifications: async () => ({
            status: 'PENDING',
            reason: 'Notification dispatch is handled by the backend after synchronization.',
          }),
        },
      });

      if (result?.cancelled) {
        showToast('SOS cancelled before dispatch.', 'info');
      } else if (result?.event) {
        if (result.event.backendId) {
          await Promise.all(['sms', 'call', 'backend'].map(async serviceName => {
            const service = result.event.services?.[serviceName];
            if (!service || service.status === 'PENDING') return;
            const status = service.status === 'COMPLETED'
              ? 'success'
              : service.status === 'NOT_CONFIGURED'
                ? 'skipped'
                : String(service.status).toLowerCase();
            await reportSosService(token, result.event.backendId, serviceName, {
              status,
              error: service.error || undefined,
            }).catch(() => undefined);
          }));

          if (result.event.location?.latitude != null && result.event.location?.longitude != null) {
            await reportLocation(token, result.event.backendId, result.event.location).catch(() => undefined);
          } else if (result.event.services?.location?.status === 'FAILED') {
            await reportLocation(token, result.event.backendId, {
              status: 'failed',
              error: result.event.services.location.error || 'Location capture failed.',
            }).catch(() => undefined);
          }

          const camera = result.event.services?.camera;
          if (camera?.status === 'FAILED') {
            await Promise.all(['frontImage', 'backImage'].map(component => reportMedia(
              token,
              result.event.backendId,
              component,
              {status: 'failed', error: camera.error || `${component} capture failed.`},
            ).catch(() => undefined)));
          }
          const audio = result.event.services?.audio;
          if (audio?.status === 'FAILED') {
            await reportMedia(token, result.event.backendId, 'audio', {
              status: 'failed',
              error: audio.error || 'Audio capture failed.',
            }).catch(() => undefined);
          }
        }
        setSelectedSos(result.event);
        setScreen('userHome');

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
      sosInFlightRef.current = false;
    }
  };

  // ============================================================
  // LOADING SCREEN
  // ============================================================

  if (screen === 'loading' || loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E4002B" />

        <Text style={styles.loadingText}>
          Restoring your secure session...
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

      notificationCount: 0,

      showLogout: true,

      onLogout: goToLogin,
    };

    switch (screen) {
      case 'permissionOnboarding':
        return <PermissionOnboardingScreen onComplete={() => setScreen('userHome')} onDecline={() => setScreen('userHome')} />;

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
              token={token}
              onUserUpdated={updateUser}
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
              token={token}
              onLogout={goToLogin}
              onBack={() => setScreen('userHome')}
              onUserUpdated={updateUser}
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
            hideHeader={true}
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
            hideHeader={true}
            bottomNav={
              <UserBottomNav
                activeTab="Notifications"
                onNavigate={handleUserNavigation}
              />
            }>
            <UserNotificationDetailScreen
              notification={selectedNotification}
              onBack={() => setScreen('userNotifications')}
              onViewSos={async notificationSos => {
                const sosId = notificationSos?._id || notificationSos?.id || notificationSos;
                try {
                  const response = await getSos(token, sosId);
                  setSelectedSos(response.sos);
                  setScreen('userSosActive');
                } catch (error) {
                  showToast(error.message || 'Unable to load this SOS.', 'error');
                }
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
              token={token}
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
              user={user}
              token={token}
              onNavigate={handleAdminNavigation}
              onCollections={() =>
                setScreen('adminCollections')
              }
              onAddCollection={() => {
                setAddCollectionBackScreen('adminDashboard');
                setScreen('adminAddCollection');
              }}
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
              onAddCollection={() => {
                setAddCollectionBackScreen('adminCollections');
                setScreen('adminAddCollection');
              }}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setUserDetailBackScreen('adminCollections');
                setScreen('adminUserDetail');
              }}
              onNavigate={handleAdminNavigation}
              onBack={() => setScreen(addCollectionBackScreen)}
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
              onSave={collectionData => {
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
              onUpdated={updatedSos => setSelectedSos(updatedSos)}
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
              onBack={() => setScreen('adminDashboard')}
              onNotificationPress={notification => {
                setSelectedNotification(notification);
                const sosId = notification.sosId?._id || notification.sosId?.id || notification.sosId;
                if (sosId) {
                  getSos(token, sosId)
                    .then(response => {
                      setSelectedSos(response.sos);
                      setScreen('adminSosDetail');
                    })
                    .catch(error => showToast(error.message || 'Unable to load this SOS.', 'error'));
                }
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