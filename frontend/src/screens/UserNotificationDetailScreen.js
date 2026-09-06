// UserNotificationDetailScreen.js - COMPLETE FIXED
// No duplicate audio, images fixed
import React, {useEffect, useState, useRef} from 'react';
import {
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Icon from '../components/Icon';
import AudioPlayer from '../components/AudioPlayer';
import {API_BASE_URL} from '../api/config';
import {getSos, getLiveLocation} from '../api/resources';
import {stopLiveLocationSharing} from '../features/sos/services/liveLocationService';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FullscreenImageViewer from '../components/FullscreenImageViewer';

const UserNotificationDetailScreen = ({notification, onBack, onViewSos, token}) => {
  const insets = useSafeAreaInsets();

  // ================= Extract SOS ID =================
  const sosId = notification?.sosId && typeof notification.sosId === 'object'
    ? notification.sosId._id || notification.sosId.id
    : notification?.sosId;

  const initialSos = notification?.sosId && typeof notification.sosId === 'object'
    ? notification.sosId
    : null;

  // ================= State =================
  const [detail, setDetail] = useState(initialSos);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});
  const [selectedImage, setSelectedImage] = useState(null);

  // ================= Live Location States =================
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [stopping, setStopping] = useState(false);

  // ================= Media URLs =================
  const [mediaUrls, setMediaUrls] = useState({
    front: null,
    back: null,
    audio: null,
  });

  const intervalRef = useRef(null);

  // ================= Helper: Check if media exists =================
  const hasStoredMedia = (component) => {
    if (!component) return false;
    if (component.storageRef) return true;
    if (component.localPath) return true;
    const status = String(component.status || '').toLowerCase();
    if (['success', 'uploaded', 'completed', 'ready'].includes(status)) return true;
    return false;
  };

  // ================= Fetch SOS Detail =================
  const fetchSosDetail = async () => {
    if (!token || !sosId) {
      console.log('[UserNotificationDetail] No token or sosId');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      console.log('[UserNotificationDetail] Fetching SOS:', sosId);
      const result = await getSos(token, sosId, {forceRefresh: true});

      if (result?.sos) {
        const sosData = result.sos;
        console.log('[UserNotificationDetail] SOS Data received');

        setDetail(sosData);

        // ================= Extract Media URLs =================
        const components = sosData.components || {};

        const frontComp = components.frontImage;
        const backComp = components.backImage;
        const audioComp = components.audio;

        // ================= Build Media URLs =================
        const frontUrl = frontComp && frontComp.storageRef
          ? `${API_BASE_URL}/sos/${sosId}/media/frontImage/file`
          : null;

        const backUrl = backComp && backComp.storageRef
          ? `${API_BASE_URL}/sos/${sosId}/media/backImage/file`
          : null;

        const audioUrl = audioComp && audioComp.storageRef
          ? `${API_BASE_URL}/sos/${sosId}/media/audio/file`
          : null;

        console.log('[UserNotificationDetail] Media URLs:', {
          frontUrl: !!frontUrl,
          backUrl: !!backUrl,
          audioUrl: !!audioUrl,
        });

        setMediaUrls({
          front: frontUrl,
          back: backUrl,
          audio: audioUrl,
        });

        // ================= Extract Live Location =================
        if (sosData.liveLocation) {
          setLiveLocationStatus(sosData.liveLocation.status || null);
          if (sosData.liveLocation.lastLocation) {
            setLiveLocation(sosData.liveLocation.lastLocation);
            setLocationUpdateTime(
              sosData.liveLocation.lastLocation.capturedAt
                ? new Date(sosData.liveLocation.lastLocation.capturedAt).toLocaleString()
                : 'Just now',
            );
          }
        }
      }
    } catch (err) {
      console.log('[UserNotificationDetail] Fetch error:', err);
      setError(err.message || 'Unable to load details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSosDetail();
  }, [sosId, token]);

  // ================= Live Location Polling =================
  useEffect(() => {
    if (!token || !sosId) return undefined;
    let mounted = true;

    const refreshLiveLocation = async () => {
      try {
        const result = await getLiveLocation(token, sosId, {limit: 1}, {forceRefresh: true});
        if (!mounted) return;

        setLiveLocationStatus(result?.liveLocation?.status || null);
        const latest = result?.liveLocation?.lastLocation || result?.pings?.[0] || null;
        if (latest) {
          setLiveLocation(latest);
          setLocationUpdateTime(
            latest.capturedAt ? new Date(latest.capturedAt).toLocaleString() : 'Just now',
          );
        }
      } catch (_) {
        // ignore
      }
    };

    refreshLiveLocation();
    intervalRef.current = setInterval(refreshLiveLocation, 5000);

    return () => {
      mounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sosId, token]);

  // ================= Handlers =================
  const handleOpenLocation = () => {
    const loc = liveLocation || detail?.location || detail?.liveLocation;
    if (!loc) return;

    const lat = loc.lat ?? loc.latitude ?? loc.coordinates?.lat ?? null;
    const lng = loc.lng ?? loc.longitude ?? loc.coordinates?.lng ?? null;

    if (lat == null || lng == null) return;
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  };

  const stopSharing = async () => {
    if (!sosId || stopping) return;
    setStopping(true);
    try {
      await stopLiveLocationSharing({token, sosId, backendId: sosId});
      setLiveLocationStatus('stopped_by_user');
    } catch (err) {
      setError(err?.message || 'Unable to stop sharing.');
    } finally {
      setStopping(false);
    }
  };

  // ================= Data =================
  const currentSos = detail || initialSos;
  const authHeaders = {Authorization: `Bearer ${token}`};
  const liveActive = String(liveLocationStatus || currentSos?.liveLocation?.status || '').toLowerCase() === 'active';

  const frontMediaUrl = mediaUrls.front;
  const backMediaUrl = mediaUrls.back;
  const audioMediaUrl = mediaUrls.audio;

  const hasFrontImage = !!frontMediaUrl;
  const hasBackImage = !!backMediaUrl;
  const hasAudio = !!audioMediaUrl;
  const hasImageData = hasFrontImage || hasBackImage;

  // ================= Location Data =================
  const latestLocation = liveLocation || currentSos?.liveLocation?.lastLocation || currentSos?.location || currentSos?.liveLocation;

  const displayLat = latestLocation?.lat
    ?? latestLocation?.latitude
    ?? latestLocation?.coordinates?.lat
    ?? null;

  const displayLng = latestLocation?.lng
    ?? latestLocation?.longitude
    ?? latestLocation?.coordinates?.lng
    ?? null;

  const displayAccuracy = latestLocation?.accuracy
    ?? latestLocation?.coordinates?.accuracy
    ?? null;

  const hasLocation = displayLat !== null && displayLng !== null
    && !isNaN(displayLat) && !isNaN(displayLng)
    && Math.abs(displayLat) <= 90 && Math.abs(displayLng) <= 180;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E4002B" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ================= HEADER ================= */}
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Notification</Text>
        <View style={styles.headerRight} />
      </View>

      {notification ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* ================= NOTIFICATION HEADER ================= */}
          <View style={styles.notificationHeader}>
            <View style={styles.notificationIconContainer}>
              <Icon name={notification.sosId ? 'sos' : 'notifications'} size={32} color="#FFFFFF" />
            </View>
            <View style={styles.notificationHeaderContent}>
              <Text style={styles.heading}>{notification.title || 'Notification'}</Text>
              <Text style={styles.time}>
                {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Time unavailable'}
              </Text>
            </View>
          </View>

          <Text style={styles.body}>{notification.body || 'No notification message was provided.'}</Text>

          {/* ================= SOS STATUS ================= */}
          {currentSos && (
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>SOS STATUS</Text>
              <Text style={[styles.metaValue, currentSos.status === 'active' && styles.metaValueActive]}>
                {String(currentSos.status || 'unknown').toUpperCase()}
              </Text>
              <Text style={styles.metaLabel}>EMERGENCY MESSAGE</Text>
              <Text style={styles.metaValue}>{currentSos.emergencyMessage || 'No emergency message recorded.'}</Text>
            </View>
          )}

          {/* ================= LIVE LOCATION ================= */}
          {currentSos && hasLocation && (
            <View style={styles.locationSection}>
              <View style={styles.locationHeader}>
                <Text style={styles.locationLabel}>📍 {liveActive ? 'LIVE LOCATION' : 'LOCATION'}</Text>
                {liveActive && (
                  <View style={styles.liveBadge}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.locationCard} onPress={handleOpenLocation} activeOpacity={0.8}>
                <Text style={styles.locationCoords}>
                  {Number(displayLat).toFixed(6)}, {Number(displayLng).toFixed(6)}
                </Text>
                <Text style={styles.locationAccuracy}>
                  {displayAccuracy != null ? `±${displayAccuracy}m accuracy` : 'Accuracy: Unknown'}
                </Text>
                <Text style={styles.locationUpdated}>Updated: {locationUpdateTime}</Text>
                <Text style={styles.locationTap}>Tap to open in Google Maps</Text>
              </TouchableOpacity>

              {liveActive && (
                <TouchableOpacity style={styles.stopButton} onPress={stopSharing} disabled={stopping}>
                  <Text style={styles.stopButtonText}>{stopping ? 'Stopping...' : 'Stop Sharing'}</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ================= EMERGENCY LINK ================= */}
          {currentSos?.emergencyLink && (
            <View style={styles.linkSection}>
              <Text style={styles.linkLabel}>🔗 EMERGENCY TRACKING LINK</Text>
              <TouchableOpacity style={styles.linkCard} onPress={() => Linking.openURL(currentSos.emergencyLink)}>
                <Text style={styles.linkText}>{currentSos.emergencyLink}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ================= PHOTOS ================= */}
          {hasImageData && (
            <View style={styles.mediaSection}>
              <Text style={styles.mediaTitle}>📷 PHOTOS</Text>
              <View style={styles.photosGrid}>
                {hasFrontImage && !hiddenImages.front && (
                  <View style={styles.photoBox}>
                    <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Front</Text></View>
                    <TouchableOpacity onPress={() => setSelectedImage(frontMediaUrl)} activeOpacity={0.85}>
                      <Image
                        source={{uri: frontMediaUrl, headers: authHeaders}}
                        style={styles.photoImage}
                        onError={() => setHiddenImages(prev => ({...prev, front: true}))}
                      />
                    </TouchableOpacity>
                  </View>
                )}
                {hasBackImage && !hiddenImages.back && (
                  <View style={styles.photoBox}>
                    <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Back</Text></View>
                    <TouchableOpacity onPress={() => setSelectedImage(backMediaUrl)} activeOpacity={0.85}>
                      <Image
                        source={{uri: backMediaUrl, headers: authHeaders}}
                        style={styles.photoImage}
                        onError={() => setHiddenImages(prev => ({...prev, back: true}))}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* ================= AUDIO - SINGLE INSTANCE ================= */}
          <View style={styles.mediaSection}>
            <Text style={styles.mediaTitle}>🎙️ VOICE RECORDING</Text>
            {hasAudio ? (
              <View style={styles.audioCard}>
                <AudioPlayer
                  audioUrl={audioMediaUrl}
                  token={token}
                  publicMedia={false}
                  directFetch={true}
                  style={styles.audioPlayer}
                  onError={(err) => console.log('[Audio Error]', err)}
                />
              </View>
            ) : (
              <Text style={styles.noMediaText}>No audio recording available.</Text>
            )}
          </View>

          {/* ================= VIEW SOS DETAILS ================= */}
          {sosId && (
            <TouchableOpacity style={styles.viewSosButton} onPress={() => onViewSos?.(sosId)}>
              <Text style={styles.viewSosButtonText}>View Full SOS Details</Text>
            </TouchableOpacity>
          )}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

        </ScrollView>
      ) : (
        <View style={styles.content}>
          <Text style={styles.heading}>Notification unavailable</Text>
          <Text style={styles.body}>This notification record is no longer available.</Text>
        </View>
      )}

      <FullscreenImageViewer
        visible={Boolean(selectedImage)}
        uri={selectedImage}
        headers={authHeaders}
        onClose={() => setSelectedImage(null)}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: '#F7F7F8'},

  loadingContainer: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  loadingText: {marginTop: 16, fontSize: 14, color: '#6B7280', fontWeight: '600'},

  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8EB',
  },

  title: {fontSize: 18, fontWeight: '900', color: '#1A1A1A', flex: 1, textAlign: 'center'},
  headerRight: {width: 40},

  content: {padding: 20, paddingBottom: 30},

  notificationHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 16},
  notificationIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  notificationHeaderContent: {flex: 1},
  heading: {fontSize: 20, fontWeight: '900', color: '#1A1A1A'},
  time: {fontSize: 12, color: '#A1A1A6', marginTop: 4},
  body: {fontSize: 15, color: '#59636E', lineHeight: 22, marginBottom: 16},

  metaBox: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },

  metaLabel: {fontSize: 10, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.5, marginTop: 8},
  metaValue: {fontSize: 15, color: '#1A1A1A', fontWeight: '600', marginTop: 4},
  metaValueActive: {color: '#E4002B'},

  locationSection: {marginBottom: 16},
  locationHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  locationLabel: {fontSize: 12, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8},

  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE7EA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B', marginRight: 5},
  liveText: {fontSize: 8, fontWeight: '900', color: '#E4002B', letterSpacing: 0.5},

  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },

  locationCoords: {fontSize: 15, fontWeight: '700', color: '#1A73E8'},
  locationAccuracy: {fontSize: 12, color: '#6E6E73', marginTop: 4},
  locationUpdated: {fontSize: 11, color: '#A1A1A6', marginTop: 4},
  locationTap: {fontSize: 12, color: '#E4002B', fontWeight: '700', marginTop: 8},

  stopButton: {
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#F3B5BF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },

  stopButtonText: {color: '#D9263A', fontSize: 14, fontWeight: '800'},

  linkSection: {marginBottom: 16},
  linkLabel: {fontSize: 11, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.5, marginBottom: 6},
  linkCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 12},
  linkText: {color: '#E4002B', fontSize: 12, fontWeight: '700'},

  mediaSection: {marginBottom: 16},
  mediaTitle: {fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 8},

  photosGrid: {flexDirection: 'row', gap: 10},
  photoBox: {
    flex: 1,
    aspectRatio: 4 / 3,
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  photoBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 1,
  },
  photoBadgeText: {fontSize: 8, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5},
  photoImage: {width: '100%', height: '100%', resizeMode: 'cover'},

  audioCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 4},
  audioPlayer: {width: '100%'},

  noMediaText: {color: '#A1A1A6', fontSize: 13, textAlign: 'center', padding: 12},

  viewSosButton: {
    backgroundColor: '#E4002B',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },

  viewSosButtonText: {color: '#FFFFFF', fontWeight: '800', fontSize: 15},

  errorText: {color: '#B42318', fontSize: 13, textAlign: 'center', marginTop: 10},
});

export default UserNotificationDetailScreen;