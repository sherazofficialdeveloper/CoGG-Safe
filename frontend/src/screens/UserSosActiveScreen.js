// UserSosActiveScreen.js
import React, {useEffect, useState, useRef, useCallback} from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {cancelSos, getLiveLocation} from '../api/resources';
import {
  isExpiresAtPast,
  pingLiveLocationUpdate,
  startLiveLocationSharing,
  stopLiveLocationSharing,
  syncPendingLocationPings,
  LIVE_LOCATION_MAX_DURATION_MS,
} from '../features/sos/services/liveLocationService';
import {getCurrentLocation} from '../features/sos/services/locationService';
import {connectivityService} from '../features/sos/connectivity';
import {sosLocalStore} from '../features/sos/storage';

const PING_INTERVAL_MS = 20000; // 20 seconds between real GPS pings while active
const COUNTDOWN_MS = 10000;

function formatTimeRemaining(ms) {
  if (ms <= 0) return '0m remaining';
  const totalMinutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${minutes}m ${seconds}s remaining`;
}

function formatExpiryTime(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  } catch (e) {
    return '';
  }
}

const UserSosActiveScreen = ({token, sos, onBack, onCancelSos, onViewContacts}) => {
  const [sosRecord, setSosRecord] = useState(sos);
  const [sharingStatus, setSharingStatus] = useState(() => {
    if (sos?.liveLocationStatus === 'STOPPED_MAX_DURATION') return 'STOPPED_MAX_DURATION';
    if (sos?.liveLocationStatus === 'STOPPED_BY_USER') return 'STOPPED_BY_USER';
    if (sos?.liveLocationStatus === 'STOPPED_BY_ADMIN') return 'STOPPED_BY_ADMIN';
    return sos?.liveLocationStatus === 'ACTIVE' || sos?.services?.liveLocation?.status === 'COMPLETED' ? 'ACTIVE' : 'PENDING';
  });

  const [currentCoords, setCurrentCoords] = useState(() => {
    return sos?.location?.latitude != null ? {
      latitude: sos.location.latitude,
      longitude: sos.location.longitude,
      accuracy: sos.location.accuracy || null,
      capturedAt: sos.location.capturedAt || null,
    } : null;
  });

  const [expiresAt, setExpiresAt] = useState(() => {
    return sos?.liveLocationExpiresAt || null;
  });
  const [startedAt, setStartedAt] = useState(() => {
    return sos?.liveLocationStartedAt || sos?.services?.liveLocation?.startedAt || null;
  });

  const [timeRemainingStr, setTimeRemainingStr] = useState('');
  const [pendingPingsCount, setPendingPingsCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() => connectivityService.getInternetAvailability());
  const [actionLoading, setActionLoading] = useState(false);
  const [syncingPings, setSyncingPings] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [countdownRemaining, setCountdownRemaining] = useState(() => {
    if (sos?.status !== 'PENDING' || !sos?.createdAt) return 0;
    return Math.max(0, COUNTDOWN_MS - (Date.now() - new Date(sos.createdAt).getTime()));
  });

  const backendId = sosRecord?.backendId || sosRecord?._id || (typeof sosRecord?.id === 'string' && !sosRecord.id.startsWith('sos_') ? sosRecord.id : null);
  const localSosId = sosRecord?.id || sosRecord?._id;
  const serviceResults = Object.entries(sosRecord?.components || sosRecord?.services || {});

  const pingTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    if (sos) setSosRecord(sos);
  }, [sos]);

  useEffect(() => {
    if (!localSosId) return undefined;
    const refreshLocalRecord = async () => {
      const latest = await sosLocalStore.getSosById(localSosId);
      if (latest && isMountedRef.current) setSosRecord(latest);
    };
    const interval = setInterval(refreshLocalRecord, 1000);
    return () => clearInterval(interval);
  }, [localSosId]);

  // Helper to refresh pending pings count from local storage
  const refreshPendingCount = useCallback(async () => {
    if (!localSosId) return;
    const pings = await sosLocalStore.getPendingLocationPings(localSosId);
    if (isMountedRef.current) {
      setPendingPingsCount(pings.length);
    }
  }, [localSosId]);

  // Periodic GPS Capture & Ping
  const captureAndPingLocation = useCallback(async () => {
    if (sharingStatus !== 'ACTIVE') return;

    // Verify expiry before pinging
    const effectiveExpiresAt = expiresAt || (startedAt ? new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS).toISOString() : null);
    if (effectiveExpiresAt && isExpiresAtPast(effectiveExpiresAt)) {
      if (isMountedRef.current) {
        setSharingStatus('STOPPED_MAX_DURATION');
      }
      return;
    }

    try {
      const loc = await getCurrentLocation().catch(() => null);
      if (!loc || loc.latitude == null || loc.longitude == null) {
        return;
      }

      if (isMountedRef.current) {
        setCurrentCoords(loc);
      }

      const result = await pingLiveLocationUpdate({
        token,
        sosId: localSosId,
        backendId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        capturedAt: loc.capturedAt,
      });

      if (result.queued) {
        await refreshPendingCount();
      }
    } catch (err) {
      // Non-fatal error; offline queueing handles it
      await refreshPendingCount();
    }
  }, [sharingStatus, expiresAt, startedAt, token, localSosId, backendId, refreshPendingCount]);

  // Synchronize queued pending pings when online
  const syncQueuedPings = useCallback(async () => {
    if (!token || !backendId || !localSosId || syncingPings) return;
    setSyncingPings(true);
    try {
      await syncPendingLocationPings({token, sosId: localSosId, backendId});
      await refreshPendingCount();
    } catch (e) {
      // Ignored
    } finally {
      if (isMountedRef.current) setSyncingPings(false);
    }
  }, [token, backendId, localSosId, syncingPings, refreshPendingCount]);

  // Check and enforce authoritative live location expiry
  const checkExpiryStatus = useCallback(() => {
    const effectiveExpiresAt = expiresAt || (startedAt ? new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS).toISOString() : null);
    if (!effectiveExpiresAt) return false;

    const now = Date.now();
    const expiryTime = new Date(effectiveExpiresAt).getTime();
    const diff = expiryTime - now;

    if (diff <= 0) {
      if (isMountedRef.current) {
        setSharingStatus('STOPPED_MAX_DURATION');
        setTimeRemainingStr('Expired');
      }
      return true;
    } else {
      if (isMountedRef.current) {
        setTimeRemainingStr(formatTimeRemaining(diff));
      }
      return false;
    }
  }, [expiresAt, startedAt]);

  // Fetch latest state from backend
  const refreshBackendState = useCallback(async () => {
    if (!token || !backendId) return;
    try {
      const response = await getLiveLocation(token, backendId).catch(() => null);
      if (response && isMountedRef.current) {
        const serverLive = response.liveLocation;
        if (serverLive) {
          if (serverLive.expiresAt) setExpiresAt(serverLive.expiresAt);
          if (serverLive.startedAt) setStartedAt(serverLive.startedAt);

          if (serverLive.status === 'stopped_by_user') {
            setSharingStatus('STOPPED_BY_USER');
          } else if (serverLive.status === 'stopped_by_admin') {
            setSharingStatus('STOPPED_BY_ADMIN');
          } else if (serverLive.status === 'stopped_max_duration') {
            setSharingStatus('STOPPED_MAX_DURATION');
          } else if (serverLive.status === 'stopped_sos_deactivated') {
            setSharingStatus('STOPPED_SOS_DEACTIVATED');
          } else if (serverLive.status === 'active') {
            setSharingStatus('ACTIVE');
          }

          if (serverLive.lastLocation?.latitude != null) {
            setCurrentCoords(serverLive.lastLocation);
          }
        }
      }
    } catch (e) {
      // Offline fallback
    }
  }, [token, backendId]);

  // Lifecycle & connectivity listeners
  useEffect(() => {
    if (sosRecord?.status !== 'PENDING') return undefined;
    const updateCountdown = () => {
      const remaining = Math.max(0, COUNTDOWN_MS - (Date.now() - new Date(sosRecord.createdAt).getTime()));
      setCountdownRemaining(remaining);
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 250);
    return () => clearInterval(timer);
  }, [sosRecord]);

  useEffect(() => {
    isMountedRef.current = true;

    // 1. Initial pending count and backend refresh
    refreshPendingCount();
    refreshBackendState();

    // 2. Connectivity subscription
    const unsubscribeConn = connectivityService.subscribe((state) => {
      const online = Boolean(state.isInternetReachable || state.isConnected);
      if (isMountedRef.current) {
        setIsOnline(online);
      }
      if (online) {
        syncQueuedPings();
        refreshBackendState();
      }
    });

    // 3. AppState background/foreground transition listener
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        checkExpiryStatus();
        refreshPendingCount();
        if (connectivityService.getInternetAvailability()) {
          syncQueuedPings();
          refreshBackendState();
        }
        captureAndPingLocation();
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribeConn?.();
      appStateSub?.remove();
    };
  }, [refreshPendingCount, refreshBackendState, syncQueuedPings, checkExpiryStatus, captureAndPingLocation]);

  // Countdown timer effect
  useEffect(() => {
    checkExpiryStatus();
    countdownTimerRef.current = setInterval(() => {
      checkExpiryStatus();
    }, 1000);

    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, [checkExpiryStatus]);

  // Periodic GPS ping interval effect
  useEffect(() => {
    if (sharingStatus === 'ACTIVE') {
      captureAndPingLocation(); // Initial immediate ping
      pingTimerRef.current = setInterval(() => {
        captureAndPingLocation();
      }, PING_INTERVAL_MS);
    } else {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    }

    return () => {
      if (pingTimerRef.current) clearInterval(pingTimerRef.current);
    };
  }, [sharingStatus, captureAndPingLocation]);

  // Start / Stop Live Location Actions
  const handleToggleLiveLocation = async () => {
    setErrorMsg('');
    setActionLoading(true);

    try {
      if (sharingStatus === 'ACTIVE') {
        // Stop Sharing
        await stopLiveLocationSharing({token, sosId: localSosId, backendId});
        setSharingStatus('STOPPED_BY_USER');
        await sosLocalStore.updateSosServiceState(localSosId, 'liveLocation', {
          status: 'STOPPED_BY_USER',
          stoppedAt: new Date().toISOString(),
        });
      } else {
        // Start or Resume Sharing
        if (checkExpiryStatus()) {
          Alert.alert('Session Expired', 'The 3-hour live location window for this emergency has passed.');
          setActionLoading(false);
          return;
        }

        const res = await startLiveLocationSharing({
          token,
          sosId: localSosId,
          backendId,
        });

        if (res.expiresAt) setExpiresAt(res.expiresAt);
        if (res.startedAt) setStartedAt(res.startedAt);
        setSharingStatus('ACTIVE');

        await sosLocalStore.updateSosServiceState(localSosId, 'liveLocation', {
          status: 'ACTIVE',
          startedAt: res.startedAt,
          expiresAt: res.expiresAt,
        });

        // Trigger immediate location capture
        captureAndPingLocation();
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update live location sharing state.');
    } finally {
      if (isMountedRef.current) setActionLoading(false);
    }
  };

  const handleCancelSos = () => {
    Alert.alert(
      'Cancel Emergency SOS',
      'Are you sure you want to cancel this active emergency alert?',
      [
        {text: 'Keep Active', style: 'cancel'},
        {
          text: 'Cancel SOS',
          style: 'destructive',
          onPress: async () => {
            try {
              if (backendId) {
                await cancelSos(token, backendId);
              }
              onCancelSos?.();
            } catch (err) {
              setErrorMsg(err.message || 'Failed to cancel emergency alert.');
            }
          },
        },
      ]
    );
  };

  if (!sosRecord) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>SOS Alert Unavailable</Text>
          <Text style={styles.emptyText}>The requested emergency record could not be loaded.</Text>
          <TouchableOpacity style={styles.backLinkButton} onPress={onBack}>
            <Text style={styles.backLinkText}>Return to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const effectiveExpiresAt = expiresAt || (startedAt ? new Date(new Date(startedAt).getTime() + LIVE_LOCATION_MAX_DURATION_MS).toISOString() : null);
  const isExpired = sharingStatus === 'STOPPED_MAX_DURATION' || (effectiveExpiresAt && isExpiresAtPast(effectiveExpiresAt));

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#E4002B" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.7} onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Emergency SOS</Text>
          <View style={styles.statusPill}>
            <View style={styles.pulsingDot} />
            <Text style={styles.statusPillText}>
              {sosRecord.status ? sosRecord.status.toUpperCase() : 'ACTIVE'}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Emergency Alert Banner */}
        <View style={styles.alertBanner}>
          <View style={styles.alertIconCircle}>
            <Text style={styles.alertIcon}>!</Text>
          </View>
          <Text style={styles.alertTitle}>
            {sosRecord.status === 'PENDING' ? 'EMERGENCY COUNTDOWN' : 'EMERGENCY ALERT ACTIVE'}
          </Text>
          <Text style={styles.alertMessage}>
            {sosRecord.status === 'PENDING'
              ? 'Emergency dispatch begins when the countdown finishes.'
              : `"${sosRecord.emergencyMessage || 'Emergency assistance requested. Safety contacts notified.'}"`}
          </Text>
          {sosRecord.status === 'PENDING' ? (
            <Text style={styles.countdownText}>
              Dispatch begins in {Math.ceil(countdownRemaining / 1000)} seconds
            </Text>
          ) : null}
          {sosRecord.activatedAt ? (
            <Text style={styles.activatedAtText}>
              Triggered at {new Date(sosRecord.activatedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}
            </Text>
          ) : null}
        </View>

        {serviceResults.length > 0 ? (
          <View style={styles.serviceResultsCard}>
            <Text style={styles.serviceResultsTitle}>SOS STATUS</Text>
            {serviceResults.map(([name, result]) => (
              <View key={name} style={styles.serviceResultRow}>
                <Text style={styles.serviceResultName}>{name}</Text>
                <Text style={[
                  styles.serviceResultStatus,
                  result?.status === 'FAILED' && styles.serviceResultFailed,
                  result?.status === 'UNSUPPORTED' && styles.serviceResultUnsupported,
                ]}>
                  {String(result?.status || 'PENDING').toUpperCase()}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* ================= LIVE LOCATION SECTION ================= */}
        <View style={styles.liveSectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionIcon}>📍</Text>
              <Text style={styles.sectionTitle}>LIVE LOCATION</Text>
            </View>

            {/* Sharing Status Badge */}
            {sharingStatus === 'ACTIVE' && isOnline ? (
              <View style={styles.badgeActive}>
                <View style={styles.activeDot} />
                <Text style={styles.badgeActiveText}>SHARING LIVE</Text>
              </View>
            ) : sharingStatus === 'ACTIVE' && !isOnline ? (
              <View style={styles.badgeOffline}>
                <Text style={styles.badgeOfflineText}>OFFLINE QUEUED</Text>
              </View>
            ) : isExpired ? (
              <View style={styles.badgeExpired}>
                <Text style={styles.badgeExpiredText}>EXPIRED (3H)</Text>
              </View>
            ) : sharingStatus === 'STOPPED_BY_ADMIN' ? (
              <View style={styles.badgeAdminStopped}>
                <Text style={styles.badgeAdminStoppedText}>STOPPED BY RESPONDER</Text>
              </View>
            ) : (
              <View style={styles.badgeStopped}>
                <Text style={styles.badgeStoppedText}>STOPPED</Text>
              </View>
            )}
          </View>

          {/* Real Coordinates & Telemetry */}
          <View style={styles.coordinatesContainer}>
            {currentCoords?.latitude != null ? (
              <View>
                <Text style={styles.coordinateValues}>
                  {Number(currentCoords.latitude).toFixed(5)}, {Number(currentCoords.longitude).toFixed(5)}
                </Text>
                <View style={styles.telemetryRow}>
                  {currentCoords.accuracy != null ? (
                    <Text style={styles.telemetryItem}>GPS Accuracy: ±{Math.round(currentCoords.accuracy)}m</Text>
                  ) : null}
                  {currentCoords.capturedAt ? (
                    <Text style={styles.telemetryItem}>
                      Updated {new Date(currentCoords.capturedAt).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : (
              <View style={styles.locatingRow}>
                <ActivityIndicator size="small" color="#E4002B" />
                <Text style={styles.locatingText}>Acquiring high-accuracy GPS fix...</Text>
              </View>
            )}
          </View>

          {/* Authoritative Expiry Information */}
          {effectiveExpiresAt && !isExpired ? (
            <View style={styles.expiryBox}>
              <View style={styles.expiryRow}>
                <Text style={styles.expiryLabel}>Session Cutoff (3-Hour Max):</Text>
                <Text style={styles.expiryTime}>{formatExpiryTime(effectiveExpiresAt)}</Text>
              </View>
              <View style={styles.expiryRow}>
                <Text style={styles.expiryRemainingLabel}>Remaining Time:</Text>
                <Text style={styles.expiryRemainingValue}>{timeRemainingStr || 'Calculating...'}</Text>
              </View>
            </View>
          ) : isExpired ? (
            <View style={styles.expiredNoticeBox}>
              <Text style={styles.expiredNoticeTitle}>Live Location Session Concluded</Text>
              <Text style={styles.expiredNoticeSub}>
                The authoritative 3-hour live tracking duration has ended. Emergency services and safety contacts retain the last known location.
              </Text>
            </View>
          ) : null}

          {/* Offline Sync State Notification */}
          {!isOnline ? (
            <View style={styles.offlineWarningBox}>
              <Text style={styles.offlineWarningText}>
                ⚡ Offline mode active. Real GPS updates are saved locally and will automatically synchronize upon reconnection.
              </Text>
              {pendingPingsCount > 0 ? (
                <Text style={styles.pendingPingsText}>
                  {pendingPingsCount} update{pendingPingsCount === 1 ? '' : 's'} buffered locally.
                </Text>
              ) : null}
            </View>
          ) : pendingPingsCount > 0 ? (
            <View style={styles.syncingBox}>
              <ActivityIndicator size="small" color="#E4002B" />
              <Text style={styles.syncingText}>
                Synchronizing {pendingPingsCount} buffered location update{pendingPingsCount === 1 ? '' : 's'}...
              </Text>
            </View>
          ) : null}

          {/* Error Message */}
          {errorMsg ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          ) : null}

          {/* Action Button: Stop / Resume Sharing */}
          {!isExpired && sharingStatus !== 'STOPPED_BY_ADMIN' && sharingStatus !== 'STOPPED_SOS_DEACTIVATED' ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                sharingStatus === 'ACTIVE' ? styles.stopButton : styles.startButton,
                actionLoading && styles.disabledButton,
              ]}
              activeOpacity={0.8}
              onPress={handleToggleLiveLocation}
              disabled={actionLoading}>
              {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.actionButtonText}>
                  {sharingStatus === 'ACTIVE' ? 'STOP SHARING LIVE LOCATION' : 'RESUME LIVE LOCATION'}
                </Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Secondary Actions */}
        <TouchableOpacity style={styles.contactsButton} activeOpacity={0.7} onPress={onViewContacts}>
          <Text style={styles.contactsButtonText}>👥 View Safety Contacts</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelSosButton} activeOpacity={0.7} onPress={handleCancelSos}>
          <Text style={styles.cancelSosButtonText}>Cancel Emergency SOS</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },
  header: {
    backgroundColor: '#E4002B',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  backIcon: {
    fontSize: 28,
    lineHeight: 30,
    color: '#FFFFFF',
    fontWeight: '300',
    marginTop: -2,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pulsingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#4ADE80',
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  serviceResultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
  },
  serviceResultsTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
    letterSpacing: 1,
    marginBottom: 8,
  },
  serviceResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#F0F1F3',
  },
  serviceResultName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  serviceResultStatus: {
    fontSize: 12,
    fontWeight: '900',
    color: '#178A4B',
  },
  serviceResultFailed: {
    color: '#B42318',
  },
  serviceResultUnsupported: {
    color: '#B54708',
  },
  alertBanner: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  alertIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  alertIcon: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E4002B',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  alertMessage: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
  },
  activatedAtText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 8,
  },
  countdownText: {
    fontSize: 18,
    color: '#E4002B',
    fontWeight: '900',
    marginTop: 12,
  },
  liveSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
    letterSpacing: 1.2,
  },
  badgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 5,
  },
  badgeActiveText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#15803D',
    letterSpacing: 0.5,
  },
  badgeOffline: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeOfflineText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#B45309',
  },
  badgeExpired: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeExpiredText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6B7280',
  },
  badgeAdminStopped: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeAdminStoppedText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#6D28D9',
  },
  badgeStopped: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  badgeStoppedText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#DC2626',
  },
  coordinatesContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 14,
  },
  coordinateValues: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  telemetryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  telemetryItem: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
  },
  locatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locatingText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  expiryBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    marginBottom: 14,
  },
  expiryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 2,
  },
  expiryLabel: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  expiryTime: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '900',
  },
  expiryRemainingLabel: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
  },
  expiryRemainingValue: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '900',
  },
  expiredNoticeBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  expiredNoticeTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
    marginBottom: 4,
  },
  expiredNoticeSub: {
    fontSize: 11,
    color: '#6B7280',
    lineHeight: 16,
    fontWeight: '500',
  },
  offlineWarningBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 10,
    marginBottom: 14,
  },
  offlineWarningText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '700',
    lineHeight: 16,
  },
  pendingPingsText: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: '900',
    marginTop: 4,
  },
  syncingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 10,
    gap: 8,
    marginBottom: 14,
  },
  syncingText: {
    fontSize: 11,
    color: '#1E40AF',
    fontWeight: '700',
  },
  errorContainer: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: '700',
  },
  actionButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopButton: {
    backgroundColor: '#111827',
  },
  startButton: {
    backgroundColor: '#E4002B',
  },
  disabledButton: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  contactsButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  contactsButtonText: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
  },
  cancelSosButton: {
    borderWidth: 1.5,
    borderColor: '#E4002B',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelSosButtonText: {
    color: '#E4002B',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  backLinkButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#E4002B',
    borderRadius: 10,
  },
  backLinkText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
});

export default UserSosActiveScreen;

