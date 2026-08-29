// App.js
import React, {useState, useEffect} from 'react';
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
import AdminCollectionsScreen from './src/screens/admin/AdminCollectionsScreen';
import AdminAddCollectionScreen from './src/screens/admin/AdminAddCollectionScreen';

// Bottom Navs
import UserBottomNav from './src/components/UserBottomNav';
import AdminBottomNav from './src/components/AdminBottomNav';

// API / SOS foundation
import {activateSosFlow} from './src/features/sos/orchestrator';
import {syncSosToBackend} from './src/features/sos/services/backendSyncService';
import {getCurrentLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms} from './src/features/sos/services/smsService';
import {initiateEmergencyCall} from './src/features/sos/services/callService';
import {startLiveLocationSharing} from './src/features/sos/services/liveLocationService';
import {connectivityService} from './src/features/sos/connectivity';
import {processSosQueue} from './src/features/sos/queue/queueWorker';

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
  const [sosError, setSosError] = useState('');
  const [activeSosCount, setActiveSosCount] = useState(0);

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
      },
    }).catch(() => undefined);

    processQueue();
    return connectivityService.subscribe(processQueue);
  }, [token]);

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
    setSosError('');
    setSosLoading(true);
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
            return sendEmergencySms({phoneNumber: user?.emergencyCallNumber, message});
          },
          call: async () => initiateEmergencyCall({emergencyNumber: user?.emergencyCallNumber}),
          location: async () => getCurrentLocation(),
          liveLocation: async (event) => startLiveLocationSharing({
            token,
            sosId: event.id,
            backendId: event.backendId,
          }),
          camera: async () => ({status: 'PENDING', reason: 'Camera capture is not available in this app build.'}),
          audio: async () => ({status: 'PENDING', reason: 'Audio capture is not available in this app build.'}),
          backend: async (event) => syncSosToBackend({token, sosEvent: event, idempotencyKey: event.id}),
          email: async () => ({status: 'NOT_CONFIGURED', reason: 'No email is configured for this account.'}),
          notifications: async () => ({status: 'PENDING', reason: 'Backend notification dispatch is queued.'}),
        },
      });

      if (result?.event) {
        setSelectedSos(result.event);
        setScreen('userSosActive');
        showToast('SOS alert triggered locally and queued for delivery.', 'success');
      }
    } catch (error) {
      setSosError(error.message);
      showToast('Failed to trigger SOS', 'error');
    } finally {
      setSosLoading(false);
    }
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
              onTriggerSos={handleTriggerSos}
              sosLoading={sosLoading}
              sosError={sosError}
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
                setScreen('userSosDetail');
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
                setScreen('userSosActive');
              }}
            />
          </AppShell>
        );

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
                setScreen('userHome');
                showToast('SOS cancelled.', 'info');
              }}
              onViewContacts={() => setScreen('userContacts')}
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