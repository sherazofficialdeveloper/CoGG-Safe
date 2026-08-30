// App.js
import React, {useState, useEffect, useRef} from 'react';
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
import AdminCollectionsScreen from './src/screens/admin/AdminCollectionsScreen';
import AdminAddCollectionScreen from './src/screens/admin/AdminAddCollectionScreen';

// Bottom Navs
import UserBottomNav from './src/components/UserBottomNav';
import AdminBottomNav from './src/components/AdminBottomNav';

// API / SOS foundation
import {activateSosFlow} from './src/features/sos/orchestrator';
import {checkSosPermissions} from './src/permissions/sosPermissions';
import {syncSosToBackend} from './src/features/sos/services/backendSyncService';
import {getCurrentLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms} from './src/features/sos/services/smsService';
import {initiateEmergencyCall} from './src/features/sos/services/callService';
import {startLiveLocationSharing} from './src/features/sos/services/liveLocationService';
import {connectivityService} from './src/features/sos/connectivity';
import {processSosQueue} from './src/features/sos/queue/queueWorker';
import {reportLocation, reportSosMedia, reportSosServiceResult} from './src/api/resources';

// ============================================================
// MAIN APP CONTENT
// ============================================================

function AppContent() {
  const {token, user, loading, signIn, signOut} = useAuth();

  const [screen, setScreen] = useState('loading');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSos, setSelectedSos] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [sosLoading, setSosLoading] = useState(false);
  const [sosCountdown, setSosCountdown] = useState(0);
  const [sosError, setSosError] = useState('');
  const [activeSosCount, setActiveSosCount] = useState(0);
  const [sosStatusLogs, setSosStatusLogs] = useState([]);
  const sosCountdownTimerRef = useRef(null);

  // Toast State
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message, type = 'success') => {
    setToast({visible: true, message, type});
  };

  const hideToast = () => {
    setToast(prev => ({...prev, visible: false}));
  };

  const appendSosStatusLog = (message, type = 'success') => {
    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;

    setSosStatusLogs((current) => {
      const dedupeKey = `${type}:${normalizedMessage}`;
      if (current.some((entry) => entry.key === dedupeKey)) return current;

      const nextEntry = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        key: dedupeKey,
        message: normalizedMessage,
        type,
      };

      return [...current, nextEntry].slice(-6);
    });
  };

  useEffect(() => {
    if (sosStatusLogs.length === 0) return undefined;

    const timers = sosStatusLogs.map((entry) => setTimeout(() => {
      setSosStatusLogs((current) => current.filter((item) => item.id !== entry.id));
    }, 4500));

    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [sosStatusLogs]);

  useEffect(() => {
    return () => {
      if (sosCountdownTimerRef.current) {
        clearTimeout(sosCountdownTimerRef.current);
      }
    };
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

    if (user.role === 'admin') {
      setScreen('adminDashboard');
    } else {
      setScreen('userHome');
    }
  }, [user, loading]);

  useEffect(() => {
    connectivityService.setup();
    if (!token) return undefined;

    const processQueue = () => processSosQueue({
      processors: {
        backend: async (item, event) => syncSosToBackend({token, sosEvent: event, idempotencyKey: event.id}),
        liveLocation: async (item, event) => startLiveLocationSharing({
          token,
          sosId: event.id,
          backendId: event.backendId,
          startedAt: event.liveLocationStartedAt,
        }),
        sms: async (item, event) => {
          const result = await sendEmergencySms({
            phoneNumber: user?.emergencyCallNumber,
            message: 'Emergency assistance requested.',
          });
          if (result?.status === 'SENT') {
            appendSosStatusLog('Emergency SMS sent', 'success');
          } else if (result?.status === 'PENDING') {
            appendSosStatusLog('Emergency SMS queued for retry', 'error');
          } else if (result?.status === 'UNSUPPORTED') {
            appendSosStatusLog('Emergency SMS unavailable', 'error');
          }
          return result;
        },
        call: async (item, event) => {
          const result = await initiateEmergencyCall({emergencyNumber: user?.emergencyCallNumber});
          if (result?.status === 'INITIATED') {
            appendSosStatusLog('Emergency call initiated', 'success');
          } else if (result?.status === 'PENDING') {
            appendSosStatusLog('Emergency call queued for retry', 'error');
          } else if (result?.status === 'UNSUPPORTED') {
            appendSosStatusLog('Emergency call unavailable', 'error');
          }
          return result;
        },
      },
    }).catch(() => undefined);

    processQueue();
    return connectivityService.subscribe(processQueue);
  }, [token, user?.emergencyCallNumber]);

  // Handle Android back button
  useEffect(() => {
    if (!user || user.role !== 'admin') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen !== 'adminDashboard' && screen.startsWith('admin')) {
        setScreen('adminDashboard');
        return true;
      }
      return false;
    });

    return () => subscription.remove();
  }, [screen, user]);

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

  // User Navigation
  const handleUserNavigation = (tab) => {
    switch (tab) {
      case 'Home': setScreen('userHome'); break;
      case 'Contacts': setScreen('userContacts'); break;
      case 'History': setScreen('userHistory'); break;
      case 'Notifications': setScreen('userNotifications'); break;
      case 'Profile': setScreen('userProfile'); break;
      default: break;
    }
  };

  // Admin Navigation
  const handleAdminNavigation = (tab) => {
    switch (tab) {
      case 'Dashboard': setScreen('adminDashboard'); break;
      case 'Collections': setScreen('adminCollections'); break;
      case 'SOS': setScreen('adminSos'); break;
      case 'Notifications': setScreen('adminNotifications'); break;
      case 'Profile': setScreen('adminProfile'); break;
      default: break;
    }
  };

  // ============================================================
  // SOS HANDLER
  // ============================================================

  const handleTriggerSos = async () => {
    if (sosLoading || sosCountdown > 0) return;

    const currentPermissionState = await checkSosPermissions();
    setSosError('');
    setSosStatusLogs([]);

    if (!currentPermissionState.allRequiredGranted) {
      setSosLoading(false);
      setSosCountdown(0);
      return;
    }

    setSosLoading(true);
    setSosCountdown(2);
    if (sosCountdownTimerRef.current) {
      clearTimeout(sosCountdownTimerRef.current);
    }

    sosCountdownTimerRef.current = setTimeout(async () => {
      setSosCountdown(0);

      const persistComponentStatus = async ({backendSosId, component, payload}) => {
        if (!token || !backendSosId || !component) return;
        try {
          if (component === 'location') {
            await reportLocation(token, backendSosId, payload);
            return;
          }
          if (['frontImage', 'backImage', 'audio'].includes(component)) {
            await reportSosMedia(token, backendSosId, component, payload);
            return;
          }
          await reportSosServiceResult(token, backendSosId, component, payload);
        } catch (error) {
          appendSosStatusLog(`${component} sync failed`, 'error');
        }
      };

      try {
        const result = await activateSosFlow({
          userId: user?._id || user?.id,
          collectionId: user?.collectionId,
          serviceRunners: {
            sms: async (event) => {
              const location = await getCurrentLocation().catch(() => null);
              const message = location
                ? `Emergency assistance requested. Location: ${location.latitude}, ${location.longitude}`
                : 'Emergency assistance requested.';
              const smsResult = await sendEmergencySms({phoneNumber: user?.emergencyCallNumber, message});
              if (smsResult?.status === 'SENT') {
                appendSosStatusLog('Emergency SMS sent', 'success');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'sms',
                  payload: {status: 'success'},
                });
              } else if (smsResult?.status === 'PENDING') {
                appendSosStatusLog('Emergency SMS queued for retry', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'sms',
                  payload: {status: 'pending', error: smsResult.reason || 'SMS queued for retry'},
                });
              } else if (smsResult?.status === 'UNSUPPORTED') {
                appendSosStatusLog('Emergency SMS unavailable', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'sms',
                  payload: {status: 'unsupported', error: smsResult.reason || 'SMS unsupported'},
                });
              } else if (smsResult?.status === 'FAILED' || smsResult?.status === 'NOT_CONFIGURED') {
                appendSosStatusLog('Emergency SMS failed', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'sms',
                  payload: {status: 'failed', error: smsResult.reason || 'SMS failed'},
                });
              }
              return smsResult;
            },
            call: async (event) => {
              const callResult = await initiateEmergencyCall({emergencyNumber: user?.emergencyCallNumber});
              if (callResult?.status === 'INITIATED') {
                appendSosStatusLog('Emergency call initiated', 'success');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'call',
                  payload: {status: 'success'},
                });
              } else if (callResult?.status === 'PENDING') {
                appendSosStatusLog('Emergency call queued for retry', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'call',
                  payload: {status: 'pending', error: callResult.reason || 'Emergency call queued for retry'},
                });
              } else if (callResult?.status === 'UNSUPPORTED' || callResult?.status === 'FAILED' || callResult?.status === 'NOT_CONFIGURED') {
                appendSosStatusLog('Emergency call failed', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'call',
                  payload: {status: callResult?.status === 'UNSUPPORTED' ? 'unsupported' : 'failed', error: callResult?.reason || 'Emergency call failed'},
                });
              }
              return callResult;
            },
            location: async (event) => {
              try {
                const location = await getCurrentLocation();
                appendSosStatusLog('Location fetched successfully', 'success');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'location',
                  payload: {
                    status: 'success',
                    latitude: location.latitude,
                    longitude: location.longitude,
                    accuracy: location.accuracy,
                    capturedAt: location.capturedAt,
                  },
                });
                return location;
              } catch (error) {
                appendSosStatusLog('Location unavailable', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'location',
                  payload: {status: 'failed', error: error?.message || 'Location unavailable'},
                });
                return {status: 'FAILED', error: error?.message || 'Location unavailable'};
              }
            },
            liveLocation: async (event) => {
              const liveLocationResult = await startLiveLocationSharing({
                token,
                sosId: event.id,
                backendId: event.backendId,
              });
              if (liveLocationResult?.status === 'COMPLETED') {
                appendSosStatusLog('Live location sharing started', 'success');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'liveLocation',
                  payload: {status: 'success'},
                });
              } else if (liveLocationResult?.status === 'PENDING') {
                appendSosStatusLog('Live location failed to start', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'liveLocation',
                  payload: {status: 'pending', error: liveLocationResult.reason || 'Live location queued'},
                });
              }
              return liveLocationResult;
            },
            camera: async (event) => {
              const {captureEmergencyPhotos} = await import('./src/features/sos/services/cameraService');
              const cameraResult = await captureEmergencyPhotos({sosId: event.id});
              if (cameraResult?.status === 'COMPLETED') {
                if (cameraResult.frontImagePath) {
                  appendSosStatusLog('Front image captured', 'success');
                  await persistComponentStatus({
                    backendSosId: event.backendId,
                    component: 'frontImage',
                    payload: {status: 'success', storageRef: cameraResult.frontImagePath, mimeType: 'image/jpeg'},
                  });
                }
                if (cameraResult.backImagePath) {
                  appendSosStatusLog('Back image captured', 'success');
                  await persistComponentStatus({
                    backendSosId: event.backendId,
                    component: 'backImage',
                    payload: {status: 'success', storageRef: cameraResult.backImagePath, mimeType: 'image/jpeg'},
                  });
                }
              } else {
                appendSosStatusLog('Front image capture failed', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'frontImage',
                  payload: {status: 'failed', error: cameraResult?.error || 'Front image capture failed'},
                });
              }
              return cameraResult;
            },
            audio: async (event) => {
              const {recordEmergencyAudio} = await import('./src/features/sos/services/audioService');
              const audioResult = await recordEmergencyAudio({sosId: event.id});
              if (audioResult?.status === 'COMPLETED') {
                appendSosStatusLog('Audio recording completed', 'success');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'audio',
                  payload: {status: 'success', storageRef: audioResult.localPath, mimeType: 'audio/m4a'},
                });
              } else {
                appendSosStatusLog('Audio recording failed', 'error');
                await persistComponentStatus({
                  backendSosId: event.backendId,
                  component: 'audio',
                  payload: {status: 'failed', error: audioResult?.error || 'Audio recording failed'},
                });
              }
              return audioResult;
            },
            backend: async (event) => {
              const backendResult = await syncSosToBackend({token, sosEvent: event, idempotencyKey: event.id});
              if (backendResult?.status === 'COMPLETED') {
                appendSosStatusLog('SOS activated', 'success');
              } else if (backendResult?.status !== 'PENDING') {
                appendSosStatusLog('SOS activation failed', 'error');
              }
              return backendResult;
            },
            email: async () => ({status: 'NOT_CONFIGURED', reason: 'No email is configured for this account.'}),
            notifications: async () => ({status: 'PENDING', reason: 'Backend notification dispatch is queued.'}),
          },
        });

        if (result?.event) {
          setSelectedSos(result.event);
        }
      } catch (error) {
        setSosError(error.message);
        appendSosStatusLog('SOS activation failed', 'error');
        showToast('Failed to trigger SOS', 'error');
      } finally {
        setSosLoading(false);
      }
    }, 2000);
  };

  // ============================================================
  // RENDER FUNCTIONS
  // ============================================================

  // Loading Screen
  if (screen === 'loading' || loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#E4002B" />
        <Text style={styles.loadingText}>Restoring your secure session...</Text>
      </View>
    );
  }

  // Login Screen
  if (screen === 'login' || !user) {
    return (
      <LoginScreen
        onLogin={(identifier, password, selectedRole) => signIn(identifier, password, selectedRole)}
      />
    );
  }

  // ============================================================
  // USER SCREENS (with AppShell - User Header)
  // ============================================================

  if (user?.role === 'user') {
    // Common props for all user screens
    const userCommonProps = {
      showNotification: true,
      onNotification: () => setScreen('userNotifications'),
      notificationCount: 0,
      showLogout: true,
      onLogout: goToLogin,
    };

    switch (screen) {
      case 'userHome':
        return (
          <AppShell
            {...userCommonProps}
            bottomNav={<UserBottomNav activeTab="Home" onNavigate={handleUserNavigation} />}>
            <UserHomeScreen
              user={user}
              token={token}
              onTriggerSos={handleTriggerSos}
              sosLoading={sosLoading}
              sosError={sosError}
              sosStatusLogs={sosStatusLogs}
            />
          </AppShell>
        );

      case 'userContacts':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={<UserBottomNav activeTab="Contacts" onNavigate={handleUserNavigation} />}>
            <UserContactsScreen onBack={() => setScreen('userHome')} />
          </AppShell>
        );

      case 'userProfile':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={<UserBottomNav activeTab="Profile" onNavigate={handleUserNavigation} />}>
            <UserProfileScreen user={user} onLogout={goToLogin} onBack={() => setScreen('userHome')} />
          </AppShell>
        );

      case 'userHistory':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={<UserBottomNav activeTab="History" onNavigate={handleUserNavigation} />}>
            <UserHistoryScreen
              token={token}
              onBack={() => setScreen('userHome')}
              onHistoryDetail={(item) => {
                setSelectedSos(item);
                setScreen('userHome');
                showToast('SOS record is available in history.', 'info');
              }}
            />
          </AppShell>
        );

      case 'userNotifications':
        return (
          <AppShell
            {...userCommonProps}
            showBack={true}
            onBack={() => setScreen('userHome')}
            bottomNav={<UserBottomNav activeTab="Notifications" onNavigate={handleUserNavigation} />}>
            <UserNotificationScreen
              token={token}
              onNotificationDetail={(notification) => {
                setSelectedNotification(notification);
                setScreen('userNotificationDetail');
              }}
              onBack={() => setScreen('userHome')}
            />
          </AppShell>
        );

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
              onViewSos={(sosId) => {
                setSelectedSos({id: sosId});
                setScreen('userHistory');
                showToast('Opening SOS history.', 'info');
              }}
            />
          </AppShell>
        );

      default:
        return (
          <AppShell
            {...userCommonProps}
            bottomNav={<UserBottomNav activeTab="Home" onNavigate={handleUserNavigation} />}>
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
  // ADMIN SCREENS (AdminHeader ONLY on Dashboard)
  // ============================================================

  if (user?.role === 'admin') {
    // Common layout without header (for non-dashboard screens)
    const AdminLayoutNoHeader = ({children, bottomNav}) => (
      <View style={styles.adminContainer}>
        <View style={styles.adminContent}>
          {children}
        </View>
        {bottomNav}
      </View>
    );

    // Common layout with header (ONLY for Dashboard)
    const AdminLayoutWithHeader = ({children, bottomNav}) => (
      <View style={styles.adminContainer}>
        <AdminHeader
          user={user}
          onNotifications={() => setScreen('adminNotifications')}
          onProfile={() => setScreen('adminProfile')}
          onLogout={goToLogin}
          activeSosCount={activeSosCount}
        />
        <View style={styles.adminContent}>
          {children}
        </View>
        {bottomNav}
      </View>
    );

    switch (screen) {
      // ========== DASHBOARD - WITH HEADER ==========
      case 'adminDashboard':
        return (
          <AdminLayoutWithHeader bottomNav={<AdminBottomNav activeTab="Dashboard" onNavigate={handleAdminNavigation} />}>
            <AdminDashboardScreen
              token={token}
              user={user}
              onNavigate={handleAdminNavigation}
              onCollections={() => setScreen('adminCollections')}
              onAddCollection={() => setScreen('adminAddCollection')}
              onSos={() => setScreen('adminSos')}
              onNotifications={() => setScreen('adminNotifications')}
              onProfile={() => setScreen('adminProfile')}
              onLogout={goToLogin}
              onUserDetail={(userData) => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
              onSosDetail={(sos) => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
            />
          </AdminLayoutWithHeader>
        );

      // ========== COLLECTIONS - WITHOUT HEADER ==========
      case 'adminCollections':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="Collections" onNavigate={handleAdminNavigation} />}>
            <AdminCollectionsScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onBack={() => setScreen('adminDashboard')}
            />
          </AdminLayoutNoHeader>
        );

      // ========== ADD COLLECTION - WITHOUT HEADER ==========
      case 'adminAddCollection':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="Dashboard" onNavigate={handleAdminNavigation} />}>
            <AdminAddCollectionScreen
              token={token}
              onBack={() => setScreen('adminDashboard')}
              onSave={(collectionData) => {
                showToast(`Collection "${collectionData.name}" created!`, 'success');
                setScreen('adminDashboard');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========== USERS - WITHOUT HEADER ==========
      case 'adminUsers':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="Users" onNavigate={handleAdminNavigation} />}>
            <AdminUsersScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onUserDetail={(userData) => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
              onBack={() => setScreen('adminDashboard')}
              onProfile={() => setScreen('adminProfile')}
            />
          </AdminLayoutNoHeader>
        );

      // ========== USER DETAIL - WITHOUT HEADER ==========
      case 'adminUserDetail':
        return (
          <AdminLayoutNoHeader>
            <AdminUserDetailScreen
              token={token}
              user={selectedUser}
              onBack={() => setScreen('adminUsers')}
              onSosDetail={(sos) => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========== SOS - WITHOUT HEADER ==========
      case 'adminSos':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="SOS" onNavigate={handleAdminNavigation} />}>
            <AdminSosScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onSosDetail={(sos) => {
                setSelectedSos(sos);
                setScreen('adminSosDetail');
              }}
              onBack={() => setScreen('adminDashboard')}
              onProfile={() => setScreen('adminProfile')}
            />
          </AdminLayoutNoHeader>
        );

      // ========== SOS DETAIL - WITHOUT HEADER ==========
      case 'adminSosDetail':
        return (
          <AdminLayoutNoHeader>
            <AdminSosDetailScreen
              token={token}
              sos={selectedSos}
              onBack={() => setScreen('adminSos')}
              onUserDetail={(userData) => {
                setSelectedUser(userData);
                setScreen('adminUserDetail');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========== NOTIFICATIONS - WITHOUT HEADER ==========
      case 'adminNotifications':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="Notifications" onNavigate={handleAdminNavigation} />}>
            <AdminNotificationScreen
              token={token}
              onNavigate={handleAdminNavigation}
              onBack={() => setScreen('adminDashboard')}
              onNotificationPress={(notification) => {
                setSelectedNotification(notification);
                showToast('Notification opened', 'info');
              }}
            />
          </AdminLayoutNoHeader>
        );

      // ========== PROFILE - WITHOUT HEADER ==========
      case 'adminProfile':
        return (
          <AdminLayoutNoHeader bottomNav={<AdminBottomNav activeTab="Profile" onNavigate={handleAdminNavigation} />}>
            <AdminProfileScreen
              user={user}
              onNavigate={handleAdminNavigation}
              onLogout={goToLogin}
              onBack={() => setScreen('adminDashboard')}
            />
          </AdminLayoutNoHeader>
        );

      default:
        return (
          <AdminLayoutWithHeader bottomNav={<AdminBottomNav activeTab="Dashboard" onNavigate={handleAdminNavigation} />}>
            <AdminDashboardScreen
              user={user}
              onNavigate={handleAdminNavigation}
              onCollections={() => setScreen('adminCollections')}
              onAddCollection={() => setScreen('adminAddCollection')}
              onSos={() => setScreen('adminSos')}
              onNotifications={() => setScreen('adminNotifications')}
              onProfile={() => setScreen('adminProfile')}
              onLogout={goToLogin}
            />
          </AdminLayoutWithHeader>
        );
    }
  }

  // Fallback
  return (
    <LoginScreen
      onLogin={(identifier, password) => signIn(identifier, password, 'user')}
      onAdminLogin={(identifier, password) => signIn(identifier, password, 'admin')}
    />
  );
}

// ============================================================
// MAIN APP
// ============================================================

export default function App() {
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message, type = 'success') => {
    setToast({visible: true, message, type});
  };

  const hideToast = () => {
    setToast(prev => ({...prev, visible: false}));
  };

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <View style={styles.container}>
          <AppContent />
          <Toast
            visible={toast.visible}
            message={toast.message}
            type={toast.type}
            onHide={hideToast}
          />
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