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
import SplashScreen from './src/components/SplashScreen';

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
import AdminDashboardScreen, {clearDashboardSnapshots} from './src/screens/admin/AdminDashboardScreen';
import AdminUsersScreen from './src/screens/admin/AdminUsersScreen';
import AdminUserDetailScreen from './src/screens/admin/AdminUserDetailScreen';
import AdminSosScreen from './src/screens/admin/AdminSosScreen';
import AdminSosDetailScreen from './src/screens/admin/AdminSosDetailScreen';
import AdminNotificationScreen from './src/screens/admin/AdminNotificationScreen';
import AdminProfileScreen from './src/screens/admin/AdminProfileScreen';
import AdminCollectionsScreen, {clearCollectionSnapshots} from './src/screens/admin/AdminCollectionsBackendScreen';
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
import {getCurrentLocation, isValidLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms, sendEmergencySmsToNumbers} from './src/features/sos/services/smsService';
import {initiateEmergencyCall} from './src/features/sos/services/callService';

import {
  startLiveLocationSharing,
  syncPendingLocationPings,
} from './src/features/sos/services/liveLocationService';

import {captureEmergencyPhotos} from './src/features/sos/services/cameraService';
import {recordEmergencyAudio} from './src/features/sos/services/audioService';
import {emitSosDiagnostic} from './src/features/sos/services/sosDiagnosticService';
import {reportServiceResult} from './src/features/sos/services/backendSyncService';
import {listContacts, listNotifications, stopLiveLocation, getSos} from './src/api/resources';
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

  // Keep a durable last-known collection member list so the trigger-critical
  // first SMS can still resolve recipients after an app restart or while the
  // internet is down. This is data-only caching; it does not change the UI.
  useEffect(() => {
    if (!token || !user?.collectionId || user?.role !== 'user') return undefined;
    let cancelled = false;
    listContacts(token)
      .then(result => {
        if (cancelled) return;
        const members = result?.contacts || result?.users || result || [];
        if (Array.isArray(members)) {
          return sosLocalStore.setCachedCollectionMembers(user.collectionId, members);
        }
        return undefined;
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [token, user?.collectionId, user?.role]);

  // Global notification cache: fetch in the background as soon as an
  // authenticated portal is available. Screens can then render the cached
  // list instantly while this same source keeps the header badge current.
  useEffect(() => {
    if (!token || !user) return undefined;
    let mounted = true;
    const refreshNotificationBadge = async () => {
      try {
        const result = await listNotifications(token, undefined, {forceRefresh: true});
        if (!mounted) return;
        const items = Array.isArray(result?.notifications) ? result.notifications : [];
        const unread = items.filter(item => !item.isRead).length;
        if (user.role === 'admin') setAdminNotificationCount(unread);
        else setUserNotificationCount(unread);
      } catch (_) {
        // Badge keeps its last known value when the network is temporarily unavailable.
      }
    };
    refreshNotificationBadge();
    const timer = setInterval(refreshNotificationBadge, 10000);
    return () => { mounted = false; clearInterval(timer); };
  }, [token, user?.id, user?.role]);

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
        emitSosDiagnostic('SOS DEBUG STARTUP 01: Queue processor invoked');
        const startupQueue = await sosLocalStore.getPendingQueue();
        emitSosDiagnostic(`SOS DEBUG STARTUP 06: Queue processor jobs=${startupQueue.length}`);
        await processSosQueue({
          processors: {
            backend: async (item, event) =>
              syncSosToBackend({
                token,
                sosEvent: event,
                idempotencyKey: event.id,
                diagnosticContext: {
                  source: 'AppContent.startup.processQueue.backend',
                  queueJobId: item.id,
                  attempt: (item.attempts || 0) + 1,
                  taskType: item.type,
                },
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

            sms: async (item, event) => {
              let recipients = event.meta?.smsRecipients || [];
              if (!recipients.length) {
                const cachedMembers = await sosLocalStore.getCachedCollectionMembers(user?.collectionId);
                recipients = cachedMembers.map(member => member?.mobileNumber).filter(Boolean);
              }
              if (!recipients.length) {
                try {
                  const result = await listContacts(token);
                  const members = result?.contacts || result?.users || result || [];
                  if (Array.isArray(members)) {
                    await sosLocalStore.setCachedCollectionMembers(user?.collectionId, members);
                    recipients = members.map(member => member?.mobileNumber || member?.phone || member?.phoneNumber).filter(Boolean);
                  }
                } catch (_) {
                  // Cellular SMS can work without internet; keep the queue retryable.
                }
              }
              if (!recipients.length) {
                return {status: 'PENDING', reason: 'Collection SMS recipients are not available yet.'};
              }
              const latestEvent = await sosLocalStore.getSosById(event.id);
              await sosLocalStore.upsertSos({
                ...(latestEvent || event),
                meta: {...(latestEvent || event).meta, smsRecipients: recipients},
              });
              return sendEmergencySmsToNumbers({
                phoneNumbers: recipients,
                message: String(user?.emergencyMessage || `I am ${user?.username || 'the user'}. I may be in danger. Please help me.`).replace(/\[Username\]/gi, user?.username || 'the user'),
                sosId: event.id,
              });
            },

            linkSms: async (item, event) => {
              if (!event.emergencyLink) {
                return {status: 'WAITING_FOR_LINK', reason: 'Waiting for the backend emergency link.'};
              }
              let recipients = event.meta?.smsRecipients || [];
              if (!recipients.length) {
                const cachedMembers = await sosLocalStore.getCachedCollectionMembers(user?.collectionId);
                recipients = cachedMembers.map(member => member?.mobileNumber).filter(Boolean);
              }
              if (!recipients.length) {
                try {
                  const result = await listContacts(token);
                  const members = result?.contacts || result?.users || result || [];
                  if (Array.isArray(members)) {
                    await sosLocalStore.setCachedCollectionMembers(user?.collectionId, members);
                    recipients = members.map(member => member?.mobileNumber || member?.phone || member?.phoneNumber).filter(Boolean);
                  }
                } catch (_) {}
              }
              if (!recipients.length) {
                return {status: 'PENDING', reason: 'Waiting for collection SMS recipients.'};
              }
              return sendEmergencySmsToNumbers({
                phoneNumbers: recipients,
                message: `Emergency tracking link: ${event.emergencyLink}`,
                sosId: event.id,
                serviceKey: 'linkSms',
              });
            },

            locationSms: async (item, event) => {
              if (!isValidLocation(event.location)) {
                return {status: 'WAITING_FOR_LINK', reason: 'Waiting for the first valid GPS location.'};
              }
              let recipients = event.meta?.smsRecipients || [];
              if (!recipients.length) {
                const cachedMembers = await sosLocalStore.getCachedCollectionMembers(user?.collectionId);
                recipients = cachedMembers.map(member => member?.mobileNumber).filter(Boolean);
              }
              if (!recipients.length) {
                try {
                  const result = await listContacts(token);
                  const members = result?.contacts || result?.users || result || [];
                  if (Array.isArray(members)) {
                    await sosLocalStore.setCachedCollectionMembers(user?.collectionId, members);
                    recipients = members.map(member => member?.mobileNumber || member?.phone || member?.phoneNumber).filter(Boolean);
                  }
                } catch (_) {}
              }
              if (!recipients.length) {
                return {status: 'PENDING', reason: 'Waiting for collection SMS recipients.'};
              }
              const mapsLink = `https://maps.google.com/?q=${event.location.latitude},${event.location.longitude}`;
              const trackingPart = event.emergencyLink ? `\nLive tracking: ${event.emergencyLink}` : '';
              return sendEmergencySmsToNumbers({
                phoneNumbers: recipients,
                message: `Current GPS location: ${mapsLink}${trackingPart}`,
                sosId: event.id,
                serviceKey: 'locationSms',
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

    emitSosDiagnostic('SOS DEBUG STARTUP 00: App startup');
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
    emitSosDiagnostic('SOS DEBUG 01: Trigger received');
    setSosError('');
    setSosLoading(true);
    sosCancelSignalRef.current = {cancelled: false};
    if (__DEV__) console.log('[SOS_DEBUG] TRIGGER_START', {timestamp: new Date().toISOString()});

    try {
      let collection = await sosLocalStore.getCachedCollectionInfo(user?.collectionId);
      if (collection?.collection) collection = collection.collection;

      // Start resolving collection SMS recipients immediately, in parallel
      // with SOS activation. This prevents the first emergency SMS from
      // waiting behind GPS/camera/audio work. /contacts intentionally returns
      // all active members of the triggering user's collection except the
      // triggering user.
      const collectionSmsRecipientsPromise = (async () => {
        const cachedMembers = await sosLocalStore.getCachedCollectionMembers(user?.collectionId);
        const cachedRecipients = cachedMembers.map(item => item?.mobileNumber).filter(Boolean);
        try {
          const result = await listContacts(token);
          const members = result?.contacts || result?.users || result || [];
          const freshRecipients = Array.isArray(members)
            ? members.map(item => item?.mobileNumber || item?.phone || item?.phoneNumber).filter(Boolean)
            : [];
          if (Array.isArray(members)) {
            await sosLocalStore.setCachedCollectionMembers(user?.collectionId, members);
          }
          return freshRecipients.length ? freshRecipients : cachedRecipients;
        } catch (error) {
          if (__DEV__) console.log('[SOS][SMS] CONTACTS_FETCH_FAILED', error?.message || error);
          return cachedRecipients;
        }
      })();

      const result = await activateSosFlow({
        userId: user?._id || user?.id,
        collectionId: user?.collectionId,
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
            // FIRST SMS: send the user's emergency message as soon as the
            // three-second SOS hold completes. Do NOT wait for GPS, camera,
            // backend creation, or live-location startup.
            const fetchedRecipients = await collectionSmsRecipientsPromise;
            const recipients = fetchedRecipients.length
              ? fetchedRecipients
              : (event.meta?.smsRecipients || []);

            const message = String(
              user?.emergencyMessage ||
              `I am ${user?.username || 'the user'}. I may be in danger. Please help me.`
            ).replace(/\[Username\]/gi, user?.username || 'the user');

            if (recipients.length) {
              await sosLocalStore.upsertSos({
                ...(await sosLocalStore.getSosById(event.id) || event),
                meta: {
                  ...event.meta,
                  emergencyNumber: collection?.emergencyCallNumber || null,
                  smsRecipients: recipients,
                },
              });
            }

            const smsResult = await sendEmergencySmsToNumbers({
              phoneNumbers: recipients,
              message,
              sosId: event.id,
            });
            if (event.backendId) {
              await reportServiceResult({
                token,
                sosId: event.backendId,
                component: 'sms',
                status: (smsResult.status === 'COMPLETED' || Number(smsResult.sentCount) > 0) ? 'success' : smsResult.status === 'UNSUPPORTED' ? 'unsupported' : 'pending',
                error: (smsResult.status === 'COMPLETED' || Number(smsResult.sentCount) > 0) ? null : smsResult.reason || null,
              }).catch(() => undefined);
            }
            return smsResult;
          },

          // ------------------------------------------------------
          // EMERGENCY CALL
          // ------------------------------------------------------
          call: async event => {
            const callResult = await initiateEmergencyCall({
              emergencyNumber: collection?.emergencyCallNumber,
            });
            if (event.backendId) {
              await reportServiceResult({
                token,
                sosId: event.backendId,
                component: 'call',
                status: callResult.status === 'INITIATED' ? 'success' : callResult.status === 'UNSUPPORTED' ? 'unsupported' : callResult.status === 'PENDING' ? 'pending' : 'failed',
                error: callResult.status === 'INITIATED' ? null : callResult.reason || null,
              }).catch(() => undefined);
            }
            return callResult;
          },

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
          location: async event => {
            const location = await getCurrentLocation();
            if (isValidLocation(location)) {
              // Persist the follow-up job before attempting the send so a
              // process death between GPS acquisition and SMS transmission
              // cannot lose the location notification.
              await enqueueSosJob({
                sosId: event.id,
                type: 'LOCATION_SMS',
                serviceName: 'locationSms',
              });
            }
            return location;
          },

          // ------------------------------------------------------
          // GPS LOCATION SMS (second SMS, after a fix exists)
          // ------------------------------------------------------
          locationSms: async event => {
            if (!isValidLocation(event.location)) {
              return {status: 'PENDING', reason: 'Waiting for a valid GPS location.'};
            }
            const recipients = (await collectionSmsRecipientsPromise).length
              ? await collectionSmsRecipientsPromise
              : (event.meta?.smsRecipients || []);
            if (!recipients.length) {
              return {status: 'PENDING', reason: 'Waiting for collection SMS recipients.'};
            }
            const mapsLink = `https://maps.google.com/?q=${event.location.latitude},${event.location.longitude}`;
            const trackingPart = event.emergencyLink ? `\nLive tracking: ${event.emergencyLink}` : '';
            return sendEmergencySmsToNumbers({
              phoneNumbers: recipients,
              message: `Current GPS location: ${mapsLink}${trackingPart}`,
              sosId: event.id,
              serviceKey: 'locationSms',
            });
          },

          // ------------------------------------------------------
          // EMERGENCY TRACKING LINK SMS
          // ------------------------------------------------------
          linkSms: async event => {
            if (!event.emergencyLink) {
              return {status: 'PENDING', reason: 'Waiting for the backend emergency link.'};
            }
            const recipients = (await collectionSmsRecipientsPromise).length
              ? await collectionSmsRecipientsPromise
              : (event.meta?.smsRecipients || []);
            if (!recipients.length) {
              return {status: 'PENDING', reason: 'Waiting for collection SMS recipients.'};
            }
            return sendEmergencySmsToNumbers({
              phoneNumbers: recipients,
              message: `Emergency tracking link: ${event.emergencyLink}`,
              sosId: event.id,
              serviceKey: 'linkSms',
            });
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
              reason: 'Email dispatch is handled by the backend after SOS creation.',
          }),

          // ------------------------------------------------------
          // NOTIFICATIONS
          // ------------------------------------------------------
          notifications: async () => ({
            status: 'COMPLETED',
              reason: 'Notification dispatch is handled by the backend after SOS creation.',
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
    return <SplashScreen />;
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
              token={token}
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
              onCreated={() => { clearDashboardSnapshots(); clearCollectionSnapshots(); }}
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