// AdminSosDetailScreen.js
import React, {useEffect, useRef, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  Linking,
  Image,
} from 'react-native';
import {deactivateSos, getLiveLocation, getSos, stopLiveLocation} from '../../api/resources';
import {API_BASE_URL} from '../../api/config';
import AudioPlayer from '../../components/AudioPlayer';
import {buildMediaUrl} from '../../utils/media';
import FullscreenImageViewer from '../../components/FullscreenImageViewer';

const AdminSosDetailScreen = ({
  sos,
  onBack,
  onUserDetail,
  token,
  onUpdated,
}) => {
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const detailRequestRef = useRef(0);

  const record = detailRecord || sos || {};
  const recordId = record.id || record._id;

  const isActive = record.status === 'Active' || record.status === 'active';
  const handleMarkResolved = () => {
    Alert.alert('Mark as Resolved', 'Are you sure this emergency has been resolved?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Resolve',
        onPress: async () => {
          setActionLoading(true);
          setActionError('');
          try {
            const response = await deactivateSos(token, record.id || record._id);
            onUpdated?.(response.sos);
          } catch (error) {
            setActionError(error.message || 'Unable to resolve this SOS.');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  };


  const handleStopSharing = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const response = await stopLiveLocation(token, record.id || record._id);
      setLiveLocationStatus(response?.sos?.liveLocation?.status || 'stopped_by_admin');
      onUpdated?.(response.sos);
    } catch (error) {
      setActionError(error.message || 'Unable to stop live location.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenLocation = () => {
    const loc = liveLocation || record.location;
    if (loc?.latitude == null && loc?.lat == null) return;
    const latitude = loc.lat ?? loc.latitude;
    const longitude = loc.lng ?? loc.longitude;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    Linking.openURL(url);
  };

  // ✅ Safe access to location data
  const displayLocation = liveLocation || record.location || null;
  const displayLat = displayLocation?.lat ?? displayLocation?.latitude;
  const displayLng = displayLocation?.lng ?? displayLocation?.longitude;
  const displayAddress = displayLocation?.address || (displayLat != null ? 'Location captured' : 'Location unavailable');
  const displayAccuracy = displayLocation?.accuracy;
  const serviceResults = Object.entries(record.components || record.services || {});
  const liveLocationActive = String(liveLocationStatus || record.liveLocation?.status || '').toLowerCase() === 'active';
  const initialLiveLocationStatus = record.liveLocation?.status || null;
  const initialLiveLocation = record.liveLocation?.lastLocation || null;
  const frontImage = record.components?.frontImage;
  const backImage = record.components?.backImage;
  const audio = record.components?.audio;
  const localCamera = record.services?.camera;
  const localAudio = record.services?.audio;
  const frontMediaUrl = ['success', 'uploaded', 'ready', 'completed'].includes(String(frontImage?.status || '').toLowerCase()) && frontImage.storageRef
    ? buildMediaUrl(API_BASE_URL, record.id || record._id, 'frontImage')
    : null;
  const backMediaUrl = ['success', 'uploaded', 'ready', 'completed'].includes(String(backImage?.status || '').toLowerCase()) && backImage.storageRef
    ? buildMediaUrl(API_BASE_URL, record.id || record._id, 'backImage')
    : null;
  const audioMediaUrl = ['success', 'uploaded', 'ready', 'completed'].includes(String(audio?.status || '').toLowerCase()) && audio.storageRef
    ? buildMediaUrl(API_BASE_URL, record.id || record._id, 'audio')
    : null;
  useEffect(() => {
    const id = recordId;
    setLiveLocationStatus(initialLiveLocationStatus);
    setLiveLocation(initialLiveLocation);
    if (!token || !id) return undefined;

    const requestId = ++detailRequestRef.current;
    let mounted = true;
    getSos(token, id).then(result => {
      if (mounted && requestId === detailRequestRef.current && result?.sos) setDetailRecord(result.sos);
    }).catch(error => {
      if (mounted && requestId === detailRequestRef.current) setActionError(error.message || 'Unable to load SOS details.');
    });
    return () => { mounted = false; };
  }, [initialLiveLocation, initialLiveLocationStatus, recordId, token]);

  useEffect(() => {
    const id = recordId;
    if (!token || !id) return undefined;
    let mounted = true;
    const refreshLiveLocation = async () => {
      try {
        const result = await getLiveLocation(token, id, {limit: 1});
        if (!mounted) return;
        setLiveLocationStatus(result?.liveLocation?.status || null);
        const latest = result?.liveLocation?.lastLocation || result?.pings?.[0] || null;
        if (latest) {
          setLiveLocation(latest);
          setLocationUpdateTime(latest.capturedAt ? new Date(latest.capturedAt).toLocaleString() : 'Just now');
        }
      } catch (error) {
        if (mounted) setActionError(error.message || 'Unable to refresh live location.');
      }
    };

    refreshLiveLocation();
    const interval = liveLocationActive ? setInterval(refreshLiveLocation, 30000) : null;
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [liveLocationActive, recordId, token]);

  const hasLiveLocationData = [liveLocation, record.liveLocation?.lastLocation, record.liveLocation, record.location].some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const latitude = Number(entry.lat ?? entry.latitude ?? 'NaN');
    const longitude = Number(entry.lng ?? entry.longitude ?? 'NaN');
    return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  });
  const hasImageData = [frontMediaUrl, backMediaUrl, frontImage?.storageRef, backImage?.storageRef, localCamera?.frontImagePath, localCamera?.backImagePath].some(Boolean) || [frontImage, backImage].some((entry) => {
    const status = String(entry?.status || '').toLowerCase();
    return ['success', 'uploaded', 'ready', 'completed'].includes(status);
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F7F8"
        translucent={false}
      />

      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.7}
          onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.headerTopRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>
                {record.initials || record.userName?.charAt(0) || 'U'}
              </Text>
            </View>
            <View>
              <Text style={[styles.headerTitle, isActive && styles.headerTitleActive]}>
                {record.userName || record.userId?.username || 'Unknown User'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {record.collectionName || record.collectionId?.name || 'No Collection'}
              </Text>
            </View>
          </View>
        </View>

        <View style={[
          styles.statusBadge,
          isActive ? styles.statusActive : styles.statusResolved,
        ]}>
          <Text style={[
            styles.statusBadgeText,
            isActive ? styles.statusActiveText : styles.statusResolvedText,
          ]}>
            {record.status || 'Unknown'}
          </Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* ================= SOS MESSAGE ================= */}
        <View style={styles.messageCard}>
          <View style={styles.messageHeader}>
            <Text style={styles.messageLabel}>SOS MESSAGE</Text>
            <Text style={styles.messageTime}>{record.time || 'Time unknown'}</Text>
          </View>
          <Text style={styles.messageText}>
            "{record.emergencyMessage || 'No message provided'}"
          </Text>
        </View>

        <View style={styles.serviceResultsSection}>
          <Text style={styles.serviceResultsLabel}>SOS SERVICE RESULTS</Text>
          {serviceResults.length === 0 ? (
            <Text style={styles.serviceResultEmpty}>No service results recorded.</Text>
          ) : serviceResults.map(([name, result]) => (
            <View key={name} style={styles.serviceResultRow}>
              <Text style={styles.serviceResultName}>{name}</Text>
              <Text style={styles.serviceResultStatus}>{String(result?.status || 'unknown').toUpperCase()}</Text>
              {result?.error ? <Text style={styles.serviceResultError}>{result.error}</Text> : null}
            </View>
          ))}
        </View>
        {actionError ? <Text style={styles.serviceResultError}>{actionError}</Text> : null}

        {hasLiveLocationData ? (
          <View style={styles.locationSection}>
            <View style={styles.locationHeader}>
              <Text style={styles.locationLabel}>📍 {liveLocationActive ? 'LIVE LOCATION' : 'LOCATION'}</Text>
              {liveLocationActive && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              style={styles.mapContainer}
              activeOpacity={0.8}
              onPress={handleOpenLocation}>
              <View style={styles.mapPlaceholder}>
                <View style={styles.mapGridLine1} />
                <View style={styles.mapGridLine2} />
                <View style={styles.mapGridLine3} />
                <View style={styles.mapGridLine4} />
                <View style={styles.mapPinOuter}>
                  <View style={styles.mapPinMiddle}>
                    <View style={styles.mapPinInner} />
                  </View>
                </View>

                {isActive && <View style={styles.mapPulseRing1} />}
                {isActive && <View style={styles.mapPulseRing2} />}
              </View>
            </TouchableOpacity>

            <View style={styles.locationDetails}>
              <View style={styles.locationRow}>
                <Text style={styles.locationAddress}>{displayAddress}</Text>
              </View>
              <View style={styles.locationRow}>
                <Text style={styles.locationCoords}>
                  {displayLat != null && displayLng != null ? `${Number(displayLat).toFixed(4)}°, ${Number(displayLng).toFixed(4)}°` : 'Location unavailable'}
                </Text>
                <Text style={styles.locationAccuracy}>
                  {displayAccuracy != null ? `±${displayAccuracy}m` : 'Accuracy unavailable'}
                </Text>
              </View>
              <View style={styles.locationRow}>
                <Text style={styles.locationUpdate}>
                  Updated {locationUpdateTime}
                </Text>
                {isActive && (
                  <View style={styles.locationRefresh}>
                    <Text style={styles.locationRefreshText}>●</Text>
                    <Text style={styles.locationRefreshLabel}>Auto-updating</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        ) : null}

        {hasImageData ? (
          <View style={styles.photosSection}>
            <Text style={styles.photosLabel}>📷 CAMERA SNAPS</Text>
            <View style={styles.photosGrid}>
              <View style={styles.photoBox}>
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>Front</Text>
                </View>
                {frontMediaUrl ? (
                  <TouchableOpacity onPress={() => setSelectedImage(frontMediaUrl)} activeOpacity={0.85}>
                    <Image source={{uri: frontMediaUrl, headers: {Authorization: `Bearer ${token}`}}} style={styles.photoImage} />
                  </TouchableOpacity>
                ) : frontImage?.error || localCamera?.frontError ? (
                  <Text style={styles.photoStatus}>Failed: {frontImage?.error || localCamera.frontError}</Text>
                ) : (
                  <Text style={styles.photoStatus}>Status: {frontImage?.status || localCamera?.status || 'pending'}{frontImage?.error ? `\nReason: ${frontImage.error}` : ''}</Text>
                )}
              </View>
              <View style={styles.photoBox}>
                <View style={styles.photoBadge}>
                  <Text style={styles.photoBadgeText}>Back</Text>
                </View>
                {backMediaUrl ? (
                  <TouchableOpacity onPress={() => setSelectedImage(backMediaUrl)} activeOpacity={0.85}>
                    <Image source={{uri: backMediaUrl, headers: {Authorization: `Bearer ${token}`}}} style={styles.photoImage} />
                  </TouchableOpacity>
                ) : backImage?.error || localCamera?.backError ? (
                  <Text style={styles.photoStatus}>Failed: {backImage?.error || localCamera.backError}</Text>
                ) : (
                  <Text style={styles.photoStatus}>Status: {backImage?.status || localCamera?.status || 'pending'}{backImage?.error ? `\nReason: ${backImage.error}` : ''}</Text>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.photosSection}>
            <Text style={styles.photosLabel}>📷 CAMERA SNAPS</Text>
            <Text style={styles.photoStatus}>No camera images were captured for this SOS.</Text>
          </View>
        )}

        {/* ================= VOICE RECORDING ================= */}
        <View style={styles.audioSection}>
          <Text style={styles.audioLabel}>🎙️ VOICE RECORDING</Text>
          <View style={styles.audioCard}>
            {audioMediaUrl || localAudio?.localPath ? (
              <AudioPlayer audioUrl={audioMediaUrl} localPath={localAudio?.localPath} token={token} style={styles.audioPlayer} />
            ) : (
              <>
                <View style={styles.waveformContainer}>
                  {audio?.status === 'failed' || localAudio?.status === 'FAILED' ? (
                    <Text style={styles.noAudioText}>Failed: {audio?.error || localAudio?.error || 'Audio capture failed'}</Text>
                  ) : audio?.status === 'success' && audio.storageRef ? (
                    <Text style={styles.noAudioText}>Audio recording available</Text>
                  ) : (
                    <Text style={styles.noAudioText}>Status: {audio?.status || localAudio?.status || 'pending'}</Text>
                  )}
                </View>

                <Text style={styles.audioDuration}>Playback unavailable</Text>
              </>
            )}
          </View>
        </View>

      </ScrollView>
      <FullscreenImageViewer
        visible={Boolean(selectedImage)}
        uri={selectedImage}
        headers={{Authorization: `Bearer ${token}`}}
        onClose={() => setSelectedImage(null)}
      />

      {/* ================= ACTION BUTTONS ================= */}
      <View style={styles.actionContainer}>
        {liveLocationActive ? <TouchableOpacity
          style={styles.callButton}
          activeOpacity={0.7}
          onPress={handleStopSharing}
          disabled={actionLoading}>
          <Text style={styles.callButtonText}>{actionLoading ? 'Stopping...' : 'Stop Sharing'}</Text>
        </TouchableOpacity> : null}

        {isActive && !actionLoading ? (
          <TouchableOpacity
            style={styles.resolveButton}
            activeOpacity={0.7}
            onPress={handleMarkResolved}>
            <Text style={styles.resolveButtonText}>✓ Mark Resolved</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.resolvedButton}
            activeOpacity={0.7}
            onPress={onBack}>
            <Text style={styles.resolvedButtonText}>✓ Resolved</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },

  /* ================= HEADER ================= */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 8,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEF0',
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 30,
    color: '#1A1A1A',
    fontWeight: '300',
    marginTop: -2,
  },

  headerContent: {
    flex: 1,
    paddingHorizontal: 10,
  },

  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },

  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  headerTitleActive: {
    color: '#E4002B',
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#6E6E73',
    marginTop: 1,
    fontWeight: '500',
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },

  statusActive: {
    backgroundColor: '#FDE7EA',
  },

  statusResolved: {
    backgroundColor: '#E8F8EF',
  },

  statusBadgeText: {
    fontSize: 9,
    fontWeight: '900',
  },

  statusActiveText: {
    color: '#E4002B',
  },

  statusResolvedText: {
    color: '#178A4B',
  },

  /* ================= SCROLL ================= */
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },

  /* ================= MESSAGE ================= */
  messageCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },

  messageLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#6E6E73',
    letterSpacing: 0.8,
  },

  messageTime: {
    fontSize: 10,
    color: '#A1A1A6',
    fontWeight: '500',
  },

  messageText: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '500',
    lineHeight: 20,
  },
  serviceResultsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
  },
  serviceResultsLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#374151',
    letterSpacing: 1,
    marginBottom: 10,
  },
  serviceResultRow: {
    paddingVertical: 8,
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
    marginTop: 3,
  },
  serviceResultError: {
    fontSize: 12,
    color: '#B42318',
    marginTop: 3,
  },
  serviceResultEmpty: {
    fontSize: 13,
    color: '#68707D',
  },

  /* ================= LIVE LOCATION ================= */
  locationSection: {
    marginBottom: 12,
  },

  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  locationLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6E6E73',
    letterSpacing: 0.8,
  },

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE7EA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E4002B',
    marginRight: 5,
  },

  liveText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 0.5,
  },

  mapContainer: {
    height: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EDEDEF',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  mapPlaceholder: {
    flex: 1,
    backgroundColor: '#F0F1F3',
    position: 'relative',
  },

  mapGridLine1: {
    position: 'absolute',
    top: 30,
    left: -40,
    right: -40,
    height: 8,
    backgroundColor: '#E0E1E5',
    transform: [{rotate: '-10deg'}],
  },

  mapGridLine2: {
    position: 'absolute',
    top: 80,
    left: -40,
    right: -40,
    height: 6,
    backgroundColor: '#E3E4E8',
    transform: [{rotate: '6deg'}],
  },

  mapGridLine3: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    left: 100,
    width: 6,
    backgroundColor: '#E0E1E5',
    transform: [{rotate: '8deg'}],
  },

  mapGridLine4: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    right: 80,
    width: 6,
    backgroundColor: '#E3E4E8',
    transform: [{rotate: '-12deg'}],
  },

  mapPinOuter: {
    position: 'absolute',
    top: 45,
    left: '42%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(228, 0, 43, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapPinMiddle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(228, 0, 43, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapPinInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E4002B',
  },

  mapPulseRing1: {
    position: 'absolute',
    top: 35,
    left: '38%',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(228, 0, 43, 0.2)',
  },

  mapPulseRing2: {
    position: 'absolute',
    top: 25,
    left: '33%',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(228, 0, 43, 0.1)',
  },

  locationDetails: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  locationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },

  locationAddress: {
    fontSize: 13,
    color: '#1A1A1A',
    fontWeight: '700',
  },

  locationCoords: {
    fontSize: 11,
    color: '#1A73E8',
    fontWeight: '600',
  },

  locationAccuracy: {
    fontSize: 10,
    color: '#6E6E73',
    fontWeight: '500',
  },

  locationUpdate: {
    fontSize: 10,
    color: '#A1A1A6',
    fontWeight: '500',
  },

  locationRefresh: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  locationRefreshText: {
    fontSize: 8,
    color: '#22A06B',
    marginRight: 4,
  },

  locationRefreshLabel: {
    fontSize: 9,
    color: '#22A06B',
    fontWeight: '600',
  },

  /* ================= PHOTOS ================= */
  photosSection: {
    marginBottom: 12,
  },

  photosLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6E6E73',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  photosGrid: {
    flexDirection: 'row',
    gap: 10,
  },

  photoBox: {
    flex: 1,
    aspectRatio: 4/3,
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },

  photoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  photoBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },

  photoImage: {
    width: '100%',
    height: '100%',
  },

  photoIcon: {
    fontSize: 28,
  },

  photoLabel: {
    fontSize: 10,
    color: '#9A9A9F',
    marginTop: 4,
    fontWeight: '600',
  },

  photoStatus: {
    fontSize: 9,
    color: '#C8C8CD',
    marginTop: 2,
  },

  /* ================= VOICE ================= */
  audioSection: {
    marginBottom: 8,
  },

  audioLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6E6E73',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  audioCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  audioButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  audioButtonPlaying: {
    backgroundColor: '#178A4B',
  },

  audioButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
  },

  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 36,
  },

  waveformBar: {
    width: 3,
    borderRadius: 2,
    minHeight: 3,
  },

  noAudioText: {
    fontSize: 12,
    color: '#A1A1A6',
    textAlign: 'center',
    width: '100%',
  },

  audioDuration: {
    fontSize: 11,
    color: '#6E6E73',
    fontWeight: '600',
    minWidth: 36,
    textAlign: 'right',
  },

  /* ================= ACTION BUTTONS ================= */
  actionContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EDEDEF',
  },

  callButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: '#E4E4E6',
    alignItems: 'center',
  },

  callButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  resolveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },

  resolveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  resolvedButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#178A4B',
    alignItems: 'center',
  },

  resolvedButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AdminSosDetailScreen;