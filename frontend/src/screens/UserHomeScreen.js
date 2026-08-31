// UserHomeScreen.js - Professional content only, no header/bottom nav

import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Animated,
} from 'react-native';
import {
  checkSosPermissions,
  createInitialSosPermissionState,
  openSosPermissionSettings,
  requestRequiredPermissions,
  subscribeToPermissionChanges,
} from '../permissions/sosPermissions';
import {listSos, stopLiveLocation} from '../api/resources';
import {getHoldSnapshot, SOS_HOLD_DURATION_MS} from '../features/sos/holdState';

const UserHomeScreen = ({
  user,
  token,
  onTriggerSos,
  sosLoading = false,
  sosError = '',
  onSwitchToAdmin,
  sosStatusLogs = [],
}) => {
  const [permissionState, setPermissionState] = useState(createInitialSosPermissionState);
  const [requestingPermissions, setRequestingPermissions] = useState(false);
  const [activeSharingSos, setActiveSharingSos] = useState(null);
  const [hasActiveSosSession, setHasActiveSosSession] = useState(false);
  const [sharingError, setSharingError] = useState('');
  const [stoppingSharing, setStoppingSharing] = useState(false);
  const [holdPhase, setHoldPhase] = useState('idle');
  const [countdown, setCountdown] = useState(3);
  const [holdProgress, setHoldProgress] = useState(0);
  const holdAnimationRef = useRef(null);
  const holdStartedAtRef = useRef(0);
  const ringRotation = useRef(new Animated.Value(0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const missingPermissions = [
    permissionState.location !== 'granted' && 'location',
    permissionState.camera !== 'granted' && 'camera',
    permissionState.audio !== 'granted' && 'microphone',
    permissionState.sms !== 'granted' && 'SMS',
    permissionState.call !== 'granted' && 'Phone',
    permissionState.notifications !== 'granted' && 'notifications',
  ].filter(Boolean);

  useEffect(() => {
    let mounted = true;

    const refreshPermissions = async () => {
      if (!mounted) return;
      setPermissionState(current => ({...current, isChecking: true}));
      const nextState = await checkSosPermissions();
      if (mounted) setPermissionState(nextState);
    };

    const unsubscribe = subscribeToPermissionChanges(refreshPermissions);
    refreshPermissions();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setActiveSharingSos(null);
      setHasActiveSosSession(false);
      return undefined;
    }

    let mounted = true;
    listSos(token, {status: 'active', limit: 10})
      .then(result => {
        if (!mounted) return;
        const activeSos = (result.sos || []).find(item => item.status === 'active');
        const activeLocation = (result.sos || []).find(item => item.liveLocation?.status === 'active');
        setHasActiveSosSession(Boolean(activeSos));
        setActiveSharingSos(activeLocation || null);
      })
      .catch(error => mounted && setSharingError(error.message));
    return () => { mounted = false; };
  }, [token]);

  const handleStopSharing = async () => {
    if (!activeSharingSos || stoppingSharing) return;
    setStoppingSharing(true);
    setSharingError('');
    try {
      await stopLiveLocation(token, activeSharingSos.id || activeSharingSos._id);
      setActiveSharingSos(null);
    } catch (error) {
      setSharingError(error.message || 'Unable to stop sharing.');
    } finally {
      setStoppingSharing(false);
    }
  };

  const resetHoldState = () => {
    if (holdAnimationRef.current) {
      cancelAnimationFrame(holdAnimationRef.current);
      holdAnimationRef.current = null;
    }
    holdStartedAtRef.current = 0;
    setHoldProgress(0);
    setCountdown(3);
    setHoldPhase('idle');
  };

  const handleSosPressIn = () => {
    if (permissionState.isChecking || sosLoading || hasActiveSosSession) return;
    const currentPermissionState = permissionState;
    if (!currentPermissionState.allRequiredGranted) return;

    holdStartedAtRef.current = Date.now();
    setHoldPhase('holding');
    setCountdown(3);
    setHoldProgress(0);

    const tick = () => {
      const snapshot = getHoldSnapshot({
        startedAt: holdStartedAtRef.current,
        now: Date.now(),
        durationMs: SOS_HOLD_DURATION_MS,
      });

      setHoldProgress(snapshot.progress);
      setCountdown(snapshot.countdown);

      if (snapshot.shouldActivate) {
        if (holdAnimationRef.current) {
          cancelAnimationFrame(holdAnimationRef.current);
          holdAnimationRef.current = null;
        }
        setHoldPhase('active');
        setHoldProgress(1);
        setCountdown(1);
        if (onTriggerSos) {
          onTriggerSos();
        } else {
          Alert.alert(
            'Emergency SOS',
            'Your emergency alert is being prepared.',
          );
        }
        return;
      }

      holdAnimationRef.current = requestAnimationFrame(tick);
    };

    holdAnimationRef.current = requestAnimationFrame(tick);
  };

  const handleSosPressOut = () => {
    if (holdPhase !== 'holding') return;
    resetHoldState();
  };

  useEffect(() => {
    if (holdPhase !== 'holding') {
      Animated.timing(ringRotation, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(ringRotation, {
      toValue: holdProgress * 360,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [holdPhase, holdProgress, ringRotation]);

  useEffect(() => {
    if (holdPhase !== 'active') return undefined;

    const animation = Animated.sequence([
      Animated.timing(pulseScale, {
        toValue: 1.08,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(pulseScale, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [holdPhase, pulseScale]);

  useEffect(() => {
    return () => {
      if (holdAnimationRef.current) {
        cancelAnimationFrame(holdAnimationRef.current);
      }
    };
  }, []);

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}>

      <View style={styles.mainContent}>

        {user?.role === 'admin' && onSwitchToAdmin ? (
          <TouchableOpacity
            style={styles.portalButton}
            onPress={onSwitchToAdmin}
            accessibilityRole="button">
            <Text style={styles.portalButtonText}>Admin Dashboard</Text>
          </TouchableOpacity>
        ) : null}

        {/* Emergency Heading */}
        <View style={styles.emergencyTextContainer}>
          <Text style={styles.emergencyEyebrow}>
            EMERGENCY CONTROL
          </Text>

          <Text style={styles.emergencyTitle}>
            Emergency Assistance
          </Text>

          <Text style={styles.description}>
            Press and hold for 3 seconds to trigger the emergency alert.
          </Text>
        </View>

        {/* SOS Button */}
        <View style={styles.sosSection}>
          <View style={styles.sosOuterRing}>
            <View style={styles.sosMiddleRing}>
              <View style={styles.sosInnerRing}>
                <Animated.View style={[
                  styles.progressRing,
                  {
                    opacity: holdPhase === 'holding' || holdPhase === 'active' ? 1 : 0,
                    transform: [{rotate: `${holdProgress * 360}deg`}],
                  },
                ]} />
                <TouchableOpacity
                  style={[
                    styles.sosButton,
                    sosLoading && styles.sosButtonLoading,
                    (holdPhase === 'active' || sosLoading) && styles.sosButtonActive,
                    (!permissionState.allRequiredGranted || permissionState.isChecking) && styles.sosButtonDisabled,
                    {transform: [{scale: holdPhase === 'active' ? pulseScale : 1}]},
                  ]}
                  activeOpacity={0.85}
                  onPressIn={handleSosPressIn}
                  onPressOut={handleSosPressOut}
                  disabled={sosLoading || hasActiveSosSession || !permissionState.allRequiredGranted || permissionState.isChecking}>

                  {holdPhase === 'holding' ? (
                    <>
                      <Text style={styles.countdownText}>{countdown}</Text>
                      <View style={styles.sosDivider} />
                      <Text style={styles.tapOnceText}>HOLD</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.sosText}>{holdPhase === 'active' ? 'SOS' : 'SOS'}</Text>
                      <View style={styles.sosDivider} />
                      <Text style={styles.tapOnceText}>{holdPhase === 'active' ? 'ACTIVE' : 'PRESS & HOLD'}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {sosStatusLogs.length > 0 ? (
          <View style={styles.statusLogContainer}>
            {sosStatusLogs.map((log) => (
              <View
                key={log.id}
                style={[
                  styles.statusLog,
                  log.type === 'error' ? styles.statusLogError : styles.statusLogSuccess,
                ]}>
                <Text style={styles.statusLogIcon}>{log.type === 'error' ? '✕' : '✓'}</Text>
                <Text style={styles.statusLogText}>{log.message}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {activeSharingSos ? (
          <TouchableOpacity style={styles.stopSharingButton} onPress={handleStopSharing} disabled={stoppingSharing}>
            <Text style={styles.stopSharingText}>{stoppingSharing ? 'Stopping...' : 'Stop Sharing'}</Text>
          </TouchableOpacity>
        ) : sharingError ? <Text style={styles.sosError}>{sharingError}</Text> : null}

        {/* SOS Status */}
        {sosError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.sosError}>
              {sosError}
            </Text>
          </View>
        ) : permissionState.isChecking ? (
          <View style={styles.readyContainer}>
            <Text style={styles.readyText}>Checking SOS permissions...</Text>
          </View>
        ) : permissionState.allRequiredGranted ? (
          <View style={styles.readyContainer}>
            <View style={styles.readyDot} />

            <Text style={styles.readyText}>
              Ready when you need help
            </Text>
          </View>
        ) : null}

        {!permissionState.isChecking && !permissionState.allRequiredGranted && (
          <View style={styles.permissionWarning}>
            <Text style={styles.permissionWarningTitle}>
              Permission required
            </Text>
            <Text style={styles.permissionWarningText}>
              {permissionState.canRequest
                ? `Allow ${missingPermissions.join(', ')} access before using SOS.`
                : `Required access (${missingPermissions.join(', ')}) is blocked. Enable it in your device settings before using SOS.`}
            </Text>
            <TouchableOpacity
              style={styles.permissionButton}
              disabled={requestingPermissions}
              onPress={async () => {
                if (requestingPermissions) return;
                setRequestingPermissions(true);
                setPermissionState(current => ({...current, isChecking: true}));
                try {
                  const nextState = await requestRequiredPermissions();
                  setPermissionState(nextState);
                  if (!nextState.allRequiredGranted && !nextState.canRequest) {
                    await openSosPermissionSettings();
                  }
                } finally {
                  setRequestingPermissions(false);
                }
              }}>
              <Text style={styles.permissionButtonText}>
                {requestingPermissions ? 'Requesting...' : 'Allow Permissions'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 40,
  },

  mainContent: {
    flexGrow: 1,
    alignItems: 'center',
    width: '100%',
  },

  portalButton: {
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },

  portalButtonText: {
    color: '#E4002B',
    fontSize: 14,
    fontWeight: '900',
  },

  /* ================= EMERGENCY HEADING ================= */

  emergencyTextContainer: {
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 28,
    paddingHorizontal: 14,
  },

  emergencyEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1.8,
    marginBottom: 8,
  },

  emergencyTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    lineHeight: 31,
    marginBottom: 10,
  },

  description: {
    maxWidth: 350,
    color: '#6B7280',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    fontWeight: '600',
  },

  /* ================= SOS BUTTON ================= */

  sosSection: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  sosOuterRing: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(228, 0, 43, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosMiddleRing: {
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(228, 0, 43, 0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosInnerRing: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(228, 0, 43, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosButton: {
    width: 195,
    height: 195,
    borderRadius: 98,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#E4002B',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },

  progressRing: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 4,
    borderColor: '#E4002B',
    borderTopColor: '#E4002B',
    borderRightColor: '#E4002B',
    borderLeftColor: 'rgba(228, 0, 43, 0.2)',
    borderBottomColor: 'rgba(228, 0, 43, 0.2)',
    zIndex: 1,
  },

  sosButtonLoading: {
    opacity: 0.7,
  },

  sosButtonActive: {
    backgroundColor: '#CC001F',
    shadowColor: '#CC001F',
  },

  sosButtonDisabled: {
    backgroundColor: '#9CA3AF',
    shadowColor: '#9CA3AF',
  },

  sosText: {
    color: '#FFFFFF',
    fontSize: 50,
    fontWeight: '900',
    letterSpacing: 4,
  },

  countdownText: {
    color: '#FFFFFF',
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 64,
  },

  sosDivider: {
    width: 56,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.45)',
    marginVertical: 8,
  },

  tapOnceText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
  },

  /* ================= READY STATUS ================= */

  readyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },

  readyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 7,
  },

  readyText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '800',
  },

  errorContainer: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  sosError: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },

  statusLogContainer: {
    width: '100%',
    marginTop: 14,
    gap: 8,
  },

  statusLog: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
  },

  statusLogSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },

  statusLogError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },

  statusLogIcon: {
    fontSize: 14,
    fontWeight: '900',
    marginRight: 8,
    color: '#111827',
  },

  statusLogText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#111827',
  },

  stopSharingButton: {
    alignSelf: 'stretch',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },

  stopSharingText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },

  permissionWarning: {
    width: '100%',
    marginTop: 24,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },

  permissionWarningTitle: {
    color: '#92400E',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },

  permissionWarningText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
    marginTop: 5,
    textAlign: 'center',
  },

  permissionButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F59E0B',
  },

  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  /* ================= BOTTOM SECTION ================= */

  bottomSection: {
    width: '100%',
    marginTop: 30,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7B818C',
    letterSpacing: 1.6,
    marginBottom: 14,
    paddingLeft: 2,
  },

  /* ================= MAIN STATUS CARD ================= */

  statusMainCard: {
    minHeight: 270,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    paddingLeft: 24,
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 16,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },

  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#E4002B',
  },

  statusCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  statusHeadingContent: {
    flex: 1,
    paddingRight: 10,
  },

  sectionEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 1.4,
    marginBottom: 6,
  },

  statusMainTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 27,
  },

  statusReadyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },

  statusReadyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },

  statusReadyText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#16A34A',
    letterSpacing: 0.9,
  },

  statusDivider: {
    height: 1,
    backgroundColor: '#ECEEF1',
    marginVertical: 18,
  },

  /* ================= STATUS ITEMS ================= */

  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
  },

  statusIconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F7F8FA',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },

  statusIcon: {
    fontSize: 26,
    color: '#E4002B',
    fontWeight: '900',
  },

  statusItemContent: {
    flex: 1,
  },

  statusItemTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 22,
  },

  statusItemDescription: {
    marginTop: 4,
    fontSize: 12,
    color: '#747B86',
    fontWeight: '700',
    lineHeight: 18,
  },

  itemDivider: {
    height: 1,
    backgroundColor: '#F0F1F3',
    marginVertical: 14,
    marginLeft: 73,
  },

  /* ================= INFO CARD ================= */

  infoCard: {
    minHeight: 110,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    padding: 20,
    paddingLeft: 24,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.045,
    shadowRadius: 10,
    elevation: 2,
  },

  infoCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#F59E0B',
  },

  infoIconContainer: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },

  infoIcon: {
    fontSize: 27,
  },

  infoContent: {
    flex: 1,
  },

  infoEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    marginBottom: 4,
  },

  infoTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 22,
  },

  infoDescription: {
    fontSize: 12,
    fontWeight: '700',
    color: '#747B86',
    marginTop: 4,
    lineHeight: 18,
  },
});

export default UserHomeScreen;