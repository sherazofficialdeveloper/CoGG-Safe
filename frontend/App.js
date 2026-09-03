// App.js

import React, {useCallback, useEffect, useRef, useState} from 'react';

import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  BackHandler,
  DeviceEventEmitter,
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
  uploadCapturedSosMedia,
} from './src/features/sos/services/backendSyncService';
import {getCollection, reportLocation, reportSosService, getSos, listContacts} from './src/api/resources';
import {checkApiReachability} from './src/api/config';

import {getCurrentLocation} from './src/features/sos/services/locationService';
import {sendEmergencySms, sendEmergencySmsToNumbers} from './src/features/sos/services/smsService';
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
import {emitSosToast} from './src/features/sos/services/sosToastService';
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
  const [userDetailBackScreen, setUserDetailBackScreen] = useState('adminUsers');
  const [selectedSos, setSelectedSos] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [sosLoading, setSosLoading] = useState(false);
  const [sosError, setSosError] = useState('');
  const [activeSosCount, setActiveSosCount] = useState(0);
  const [userNotificationCount, setUserNotificationCount] = useState(0);
  const [adminNotificationCount, setAdminNotificationCount] = useState(0);
  const sosCancelSignalRef = useRef({cancelled: false});
  const sosTriggerInFlightRef = useRef(false);

  const showToast = useCallback((message, type = 'success') => {
    emitSosToast(message, type);
  }, []);

  const handleUserNotificationCountChange = useCallback((count) => {
    setUserNotificationCount(count);
  }, []);

  const handleAdminNotificationCountChange = useCallback((count) => {
    setAdminNotificationCount(count);
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

  // One-shot, non-blocking backend reachability check on app start. Purely
  // diagnostic (logs only) — see checkApiReachability in src/api/config.js
  // for why this matters: an unreachable API_BASE_URL (e.g. 10.0.2.2 on a
  // physical device) otherwise looks identical to "SOS just isn't working"
  // with no indication of why.
  useEffect(() => {
    checkApiReachability();
  }, []);

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

            sms: async (item, event) => {
              const cachedContacts = await sosLocalStore
                .getCachedCollectionInfo(event.collectionId)
                .then(cached => Array.isArray(cached?.contactNumbers) ? cached.contactNumbers : [])
                .catch(() => []);
              const allNumbers = [event.meta?.emergencyNumber, ...cachedContacts].filter(Boolean);
              return sendEmergencySmsToNumbers({
                sosId: event.id,
                phoneNumbers: allNumbers,
                message: `Emergency SOS ${event.id} for ${user?.username || 'user'}.`,
              });
            },

            call: async (item, event) => initiateEmergencyCall({
              emergencyNumber: event.meta?.emergencyNumber,
            }),

            // Retries only the SPECIFIC camera lens that failed on the
            // original attempt — captureEmergencyPhotos merges its result
            // with previousResult so an already-succeeded lens is never
            // re-captured or overwritten. Enqueued automatically by
            // orchestrator.js whenever camera resolves 'PENDING' (exactly
            // one lens missing) — see RETRYABLE_SERVICES.
            camera: async (item, event) =>
              captureEmergencyPhotos({
                sosId: event.id,
                previousResult: event.services?.camera || null,
              }),

            // Durable canonical-link follow-up SMS. Replaces the old
            // in-memory `emergencyLinkPromise.then(...)` chain: this
            // processor is re-invoked by the persistent queue (on every
            // connectivity change and app restart, via
            // recoverActiveSosWork/processSosQueue) until it succeeds, so
            // the link SMS can no longer be lost to a process death. It
            // has two independent dependencies, checked separately:
            //   - the canonical link itself, which only exists once the
            //     `backend` job has completed (requires internet) — if
            //     it's not there yet, we return WAITING_FOR_LINK, which
            //     queueWorker treats as "no attempt was made" rather than
            //     a failed send, so it never burns MAX_ATTEMPTS;
            //   - cellular for the actual send, enforced upstream by
            //     queueWorker's requiresCellular('LINK_SMS').
            linkSms: async (item, event) => {
              if (!event.emergencyLink) {
                // Distinct from 'PENDING': no SMS send has been attempted
                // here, we're only waiting on the backend to produce the
                // canonical link. queueWorker treats WAITING_FOR_LINK as a
                // non-attempt, so it can never exhaust MAX_ATTEMPTS just
                // because the link is slow to arrive.
                return {
                  status: 'WAITING_FOR_LINK',
                  reason: 'Waiting for the canonical emergency link from the backend.',
                };
              }

              const cachedNumber = await sosLocalStore
                .getCachedCollectionInfo(event.collectionId)
                .then(cached => cached?.emergencyCallNumber || null)
                .catch(() => null);
              const phoneNumber = event.meta?.emergencyNumber || cachedNumber;

              if (!phoneNumber) {
                return {
                  status: 'NOT_CONFIGURED',
                  reason: 'No emergency SMS number is configured for this collection.',
                };
              }

              return sendEmergencySms({
                phoneNumber,
                message: `Emergency SOS details (photos, audio, live location): ${event.emergencyLink}`,
              });
            },
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

  // Emergency SMS must be sendable with zero network dependency. We proactively
  // cache the user's collection emergency number locally (best-effort, outside
  // the SOS path) so it is already available offline by the time SOS is ever
  // triggered, instead of requiring a live backend call at emergency time.
  useEffect(() => {
    if (!token || !user || user.role !== 'user' || !user.collectionId) {
      return undefined;
    }

    let cancelled = false;
    getCollection(token, user.collectionId)
      .then(response => {
        if (cancelled) return;
        const emergencyCallNumber = response?.collection?.emergencyCallNumber;
        if (emergencyCallNumber) {
          sosLocalStore.setCachedCollectionInfo(user.collectionId, {emergencyCallNumber}).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    // Same reasoning, for the full list of collection member numbers SMS
    // must reach (see sendEmergencySmsToNumbers). Cached here too, so a
    // user who never opens the app between login and an emergency still
    // has an up-to-date recipient list by the time SOS triggers.
    listContacts(token)
      .then(contacts => {
        if (cancelled) return;
        const numbers = (contacts || []).map(c => c?.mobileNumber).filter(Boolean);
        sosLocalStore.setCachedCollectionInfo(user.collectionId, {contactNumbers: numbers}).catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [token, user]);

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
  // SOS GLOBAL TOAST LISTENER
  // ============================================================

  useEffect(() => {
    const smsStatusSubscription = DeviceEventEmitter.addListener('sosSmsStatus', payload => {
      const stage = payload?.stage || 'sent';
      const status = payload?.status || 'success';
      const reason = payload?.reason || 'SMS status updated';

      if (stage === 'delivered') {
        showToast('SMS delivered', 'success');
        return;
      }

      if (status === 'failed') {
        showToast('SMS failed', 'error');
        return;
      }

      showToast('SMS sent', 'success');
    });

    return () => smsStatusSubscription.remove();
  }, [showToast]);

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

  /**
   * Wait for backend to confirm ACTIVE status (after cancellation window).
   * Polls with exponential backoff, times out after 30 seconds.
   */
  const waitForSosActive = useCallback(async (sosId, maxWaitMs = 30000, initialDelayMs = 500) => {
    const startTime = Date.now();
    let delayMs = initialDelayMs;
    
    while (Date.now() - startTime < maxWaitMs) {
      try {
        const sosResponse = await getSos(token, sosId);
        const sos = sosResponse?.sos || sosResponse;
        if (__DEV__) {
          console.log('[SOS_DEBUG] POLL_RESPONSE', {backendId: sosId, status: sos?.status});
        }
        if (sos?.status === 'active') {
          return {success: true, sos};
        }
      } catch (err) {
        // Network error, retry
        if (__DEV__) {
          console.log('WAIT_FOR_ACTIVE_POLL_ERROR', {sosId, error: err?.message});
        }
      }
      
      // Exponential backoff with cap
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs = Math.min(delayMs * 1.5, 2000);
    }
    
    return {success: false, reason: 'Timeout waiting for backend to activate SOS'};
  }, [token]);

  const handleTriggerSos = useCallback(async ({skipNavigation = false} = {}) => {
    if (__DEV__) console.log('[SOS][TRIGGER] HANDLE_TRIGGER_START', {skipNavigation});
    if (__DEV__) {
      console.log('SOS_ACTIVATION_REQUESTED', {
        sosLoading,
        userId: user?._id || user?.id,
        skipNavigation,
      });
    }

    if (sosLoading || sosTriggerInFlightRef.current) {
      return;
    }

    sosTriggerInFlightRef.current = true;
    setSosError('');
    setSosLoading(true);
    sosCancelSignalRef.current = {cancelled: false};

    if (__DEV__) {
      console.log('SOS_ORCHESTRATOR_STARTED', {source: 'app-trigger', skipNavigation});
    }

    try {
      let collection = null;
      let collectionPromise = Promise.resolve();
      // A locally cached emergency number (see the collection-prefetch effect
      // above) is the primary source for SMS, so sending never has to wait on
      // a live backend call. It is read once per trigger, before activation,
      // so it is ready the instant the SMS branch starts.
      const cachedEmergencyNumberPromise = sosLocalStore
        .getCachedCollectionInfo(user?.collectionId)
        .then(cached => cached?.emergencyCallNumber || null)
        .catch(() => null);

      // Same offline-first reasoning as the emergency number above, but for
      // the full set of "all valid phone numbers belonging to the selected
      // collection" that SMS must reach (unlike the call, which still only
      // rings the single configured emergencyCallNumber). Cached from the
      // last successful /api/contacts fetch (see the contacts-prefetch
      // effect below) so a triggered SOS never waits on a live request to
      // know who to text.
      const cachedContactNumbersPromise = sosLocalStore
        .getCachedCollectionInfo(user?.collectionId)
        .then(cached => Array.isArray(cached?.contactNumbers) ? cached.contactNumbers : [])
        .catch(() => []);

      const result = await activateSosFlow({
        userId: user?._id || user?.id,
        collectionId: user?.collectionId,
        countdownMs: 10000,
        cancelSignal: sosCancelSignalRef.current,
        onPending: event => {
          if (__DEV__) console.log('[SOS_DEBUG] LOCAL_EVENT', {eventId: event.id});
          if (!skipNavigation) {
            setSelectedSos(event);
            setScreen('userSosActive');
          }

          collectionPromise = getCollection(token, user?.collectionId)
            .then(collectionResponse => {
            collection = collectionResponse?.collection || null;
            const emergencyNumber = collection?.emergencyCallNumber || event?.meta?.emergencyNumber;
            if (emergencyNumber) {
              sosLocalStore.setCachedCollectionInfo(user?.collectionId, {emergencyCallNumber: emergencyNumber}).catch(() => undefined);
              return sosLocalStore.upsertSos({
                ...event,
                meta: {
                  ...event.meta,
                  emergencyNumber,
                },
              });
            }
            return undefined;
          })
          .catch(error => {
            if (__DEV__) {
              console.log('SOS_COLLECTION_LOAD_FAILED', {error: error?.message || error});
            }
          });

          // Best-effort refresh of the "everyone in this collection" number
          // list, in parallel with the collection fetch above. This never
          // blocks the SMS branch — it only refreshes the local cache
          // (which cachedContactNumbersPromise above reads from) for the
          // NEXT trigger; the current trigger already read whatever was
          // cached before this run started, by design (no live-fetch wait).
          listContacts(token)
            .then(contacts => {
              const numbers = (contacts || [])
                .map(c => c?.mobileNumber)
                .filter(Boolean);
              sosLocalStore.setCachedCollectionInfo(user?.collectionId, {contactNumbers: numbers}).catch(() => undefined);
            })
            .catch(error => {
              if (__DEV__) {
                console.log('SOS_CONTACTS_LOAD_FAILED', {error: error?.message || error});
              }
            });
        },

        serviceRunners: {
          sms: async event => {
            // SMS is an independent emergency service: it must never wait on
            // the backend, on internet, or on any other SOS branch. The
            // numbers come from the local cache (instant, works offline);
            // the live backend/contacts fetch is not awaited here.
            const [cachedNumber, cachedContacts] = await Promise.all([
              cachedEmergencyNumberPromise,
              cachedContactNumbersPromise,
            ]);
            const primaryNumber = cachedNumber || collection?.emergencyCallNumber || event?.meta?.emergencyNumber;
            // ALL valid numbers belonging to the selected collection: the
            // configured primary emergency line PLUS every other member of
            // the collection's own mobile number (deduplicated). Never just
            // the single primary number.
            const allNumbers = [primaryNumber, ...cachedContacts].filter(Boolean);

            // Location enriches the SMS body when it's already available, but
            // a slow or unavailable GPS fix must never delay the emergency SMS.
            const location = await Promise.race([
              getCurrentLocation().catch(() => null),
              new Promise(resolve => setTimeout(() => resolve(null), 1500)),
            ]);
            const mapsLink = location
              ? `https://maps.google.com/?q=${location.latitude},${location.longitude}`
              : '';
            const message = [
              `Emergency SOS Alert! ${user?.username || 'A user'} needs help.`,
              location ? `Location: ${mapsLink}` : null,
              `Time: ${new Date().toLocaleString()}`,
            ].filter(Boolean).join(' ');

            const result = await sendEmergencySmsToNumbers({
              sosId: event.id,
              phoneNumbers: allNumbers,
              message,
            });

            // Reporting the outcome to the backend is best-effort and must
            // never hold up the SMS operation itself, so it is fired after
            // SMS completes without being awaited by the SMS branch. The
            // backend's `sms` component is a single aggregate status (it has
            // no per-recipient schema) — result.status already reflects
            // "at least one recipient succeeded" per sendEmergencySmsToNumbers.
            collectionPromise.finally(() => {
              if (event.backendId) {
                const statusMap = {
                  'COMPLETED': 'success',
                  'PENDING': 'pending',
                  'FAILED': 'failed',
                  'UNSUPPORTED': 'unsupported',
                  'NOT_CONFIGURED': 'unsupported',
                };
                reportSosService(token, event.backendId, 'sms', {
                  status: statusMap[result.status] || 'failed',
                  ...(result.reason ? {error: result.reason} : {}),
                }).catch(() => undefined);
              }
            });

            // The canonical emergency-link follow-up SMS is no longer sent
            // from here. It is a durable queue job (LINK_SMS, enqueued
            // unconditionally in orchestrator.js/activateSosFlow) handled
            // by the `linkSms` processor above, so it survives app close/
            // process death instead of depending on this in-flight call
            // still being alive when the backend eventually confirms.

            return result;
          },

          call: async event => {
            // The call rings ONE primary number (kept intentionally separate
            // from SMS-to-everyone, per the collection's configured
            // emergencyCallNumber) and must never wait on the live
            // collection API — the cached number is read first, exactly
            // like the SMS branch, so a slow/offline network never delays
            // dialing. The live collectionPromise is only consulted as a
            // last-resort fallback, with a short timeout, for a brand-new
            // device that has no cache yet.
            if (__DEV__) console.log('CALL_STARTED', {eventId: event.id});
            const cachedNumber = await cachedEmergencyNumberPromise;
            let emergencyNumber = cachedNumber || event?.meta?.emergencyNumber;
            if (!emergencyNumber) {
              await Promise.race([
                collectionPromise,
                new Promise(resolve => setTimeout(resolve, 1500)),
              ]);
              emergencyNumber = collection?.emergencyCallNumber || event?.meta?.emergencyNumber;
            }

            const result = await initiateEmergencyCall({emergencyNumber});
            if (__DEV__) {
              console.log(result.status === 'INITIATED' ? 'CALL_SUCCESS' : 'CALL_FAILED', {eventId: event.id, result});
            }
            if (event.backendId) {
              // Map result status to COMPONENT_STATUS values
              const statusMap = {
                'INITIATED': 'success',
                'PENDING': 'pending',
                'FAILED': 'failed',
                'UNSUPPORTED': 'unsupported',
                'NOT_CONFIGURED': 'unsupported',
              };
              await reportSosService(token, event.backendId, 'call', {
                status: statusMap[result.status] || 'failed',
                ...(result.reason ? {error: result.reason} : {}),
              });
            }
            return result;
          },

          camera: async event =>
            captureEmergencyPhotos({
              sosId: event.id,
            }),

          audio: async event =>
            recordEmergencyAudio({
              sosId: event.id,
            }),

          mediaUpload: async event =>
            uploadCapturedSosMedia({token, sosEvent: event}),

location: async event => {
            try {
              const result = await getCurrentLocation();
              if (event.backendId) {
                await reportLocation(token, event.backendId, {status: 'success', latitude: result.latitude, longitude: result.longitude});
              }
              return result;
            } catch (error) {
              if (event.backendId) {
                await reportLocation(token, event.backendId, {status: 'failed', error: error?.message || 'Location capture failed'});
              }
              throw error;
            }
          },

          liveLocation: async event =>
            startLiveLocationSharing({
              token,
              sosId: event.id,
              backendId: event.backendId,
            }),

          backend: async event => {
            // The canonical link (once available) is picked up by the
            // durable LINK_SMS queue job via event.emergencyLink — no
            // in-memory hand-off needed here any more.
            return syncSosToBackend({
              token,
              sosEvent: event,
              idempotencyKey: event.id,
            });
          },

          email: async () => ({
            status: 'PENDING',
            reason: 'Email dispatch is pending backend confirmation.',
          }),

          notifications: async () => ({
            status: 'PENDING',
            reason: 'Push notification will be dispatched by the backend after activation.',
          }),
        },
      });

      if (result?.cancelled) {
        showToast('SOS cancelled before dispatch.', 'info');
      } else if (result?.event && result.event.backendId) {
        // Wait for backend to confirm ACTIVE status
        if (!skipNavigation) {
          showToast('Waiting for server confirmation...', 'info');
          const activationResult = await waitForSosActive(result.event.backendId);
          
          if (activationResult.success) {
            showToast('SOS Active', 'success');
            setSelectedSos({...result.event, ...activationResult.sos});
            setScreen('userHome');
          } else {
            showToast(`Backend confirmation was not received: ${activationResult.reason}`, 'error');
            setSelectedSos({...result.event, status: 'PENDING', activationError: activationResult.reason});
          }
        } else {
          showToast('SOS alert triggered and queued for delivery.', 'success');
        }
      } else if (result?.event) {
        setSelectedSos({...result.event, status: 'PENDING', activationError: 'Backend SOS creation is pending.'});
        if (!skipNavigation) {
          setScreen('userSosActive');
        }
        showToast('SOS started; waiting for backend confirmation.', 'info');
      }
    } catch (error) {
      const message =
        error?.message || 'Unable to trigger the SOS alert.';

      setSosError(message);
      showToast('Failed to trigger SOS', 'error');
    } finally {
      setSosLoading(false);
      sosTriggerInFlightRef.current = false;
    }
  }, [sosLoading, showToast, token, user, waitForSosActive]);

  useEffect(() => {
    if (!user || user.role !== 'user') {
      return undefined;
    }

    const listener = DeviceEventEmitter.addListener(
      'powerButtonSosTrigger',
      () => {
        if (!sosLoading) {
          handleTriggerSos({skipNavigation: true});
        }
      },
    );

    return () => listener.remove();
  }, [handleTriggerSos, sosLoading, user]);

  // ============================================================
  // LOADING SCREEN
  // ============================================================

  if (screen === 'loading' || loading) {
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
              onBadgeCountChange={handleUserNotificationCountChange}
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
        <Toast />
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
        <Toast />
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
              onAddCollection={() => setScreen('adminAddCollection')}
              onUserDetail={userData => {
                setSelectedUser(userData);
                setUserDetailBackScreen('adminCollections');
                setScreen('adminUserDetail');
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
              onBadgeCountChange={handleAdminNotificationCountChange}
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