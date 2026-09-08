// UserSosActiveScreen.js - COMPLETE FIXED
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  Linking,
  Image,
} from 'react-native';
import {getSos, getLiveLocation, stopLiveLocation} from '../api/resources';
import {API_BASE_URL} from '../api/config';
import AudioPlayer from '../components/AudioPlayer';
import FullscreenImageViewer from '../components/FullscreenImageViewer';
import Icon from '../components/Icon';

const UserSosActiveScreen = ({sos, token, onBack}) => {
  const [detail, setDetail] = useState(sos || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [stopping, setStopping] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});
  const [mediaUrls, setMediaUrls] = useState({front: null, back: null, audio: null});

  const recordId = detail?.id || detail?._id || sos?.id || sos?._id;

  if (!recordId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Icon name="back" size={22} color="#1A1A1A" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SOS Details</Text>
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>SOS record not found.</Text>
          <TouchableOpacity style={styles.errorBackButton} onPress={onBack}>
            <Text style={styles.errorBackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ================= Fetch SOS Detail =================
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');

    const fetchDetail = async () => {
      try {
        const result = await getSos(token, recordId, {forceRefresh: true});
        if (mounted && result?.sos) {
          const sosData = result.sos;
          setDetail(sosData);

          // ================= Extract Media URLs =================
          const components = sosData.components || {};
          
          const frontComp = components.frontImage;
          const backComp = components.backImage;
          const audioComp = components.audio;

          // ================= FIX: Check storageRef properly =================
          const frontUrl = frontComp && frontComp.storageRef
            ? `${API_BASE_URL}/sos/${recordId}/media/frontImage/file`
            : null;

          const backUrl = backComp && backComp.storageRef
            ? `${API_BASE_URL}/sos/${recordId}/media/backImage/file`
            : null;

          const audioUrl = audioComp && audioComp.storageRef
            ? `${API_BASE_URL}/sos/${recordId}/media/audio/file`
            : null;

          console.log('[UserSosActive] Media URLs:', {frontUrl: !!frontUrl, backUrl: !!backUrl, audioUrl: !!audioUrl});

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
                  : 'Just now'
              );
            }
          }
        }
      } catch (err) {
        if (mounted) setError(err.message || 'Unable to load SOS details.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchDetail();
    return () => { mounted = false; };
  }, [recordId, token]);

  // ================= Live Location Polling =================
  useEffect(() => {
    if (!token || !recordId) return undefined;
    let mounted = true;

    const refreshLiveLocation = async () => {
      try {
        const result = await getLiveLocation(token, recordId, {limit: 1}, {forceRefresh: true});
        if (!mounted) return;
        setLiveLocationStatus(result?.liveLocation?.status || null);
        const latest = result?.liveLocation?.lastLocation || result?.pings?.[0] || null;
        if (latest) {
          setLiveLocation(latest);
          setLocationUpdateTime(
            latest.capturedAt ? new Date(latest.capturedAt).toLocaleString() : 'Just now'
          );
        }
      } catch (_) { /* ignore */ }
    };

    refreshLiveLocation();
    const interval = setInterval(refreshLiveLocation, 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [recordId, token]);

  const handleStopSharing = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopLiveLocation(token, recordId);
      setLiveLocationStatus('stopped_by_user');
    } catch (err) {
      setError(err.message || 'Unable to stop sharing.');
    } finally {
      setStopping(false);
    }
  };

  const handleOpenLocation = () => {
    const loc = liveLocation || detail?.location;
    if (!loc) return;
    const lat = loc.lat ?? loc.latitude;
    const lng = loc.lng ?? loc.longitude;
    if (lat == null || lng == null) return;
    Linking.openURL(`https://www.google.com/maps?q=${lat},${lng}`);
  };

  const authHeaders = {Authorization: `Bearer ${token}`};
  const displayLocation = liveLocation || detail?.location || null;
  const displayLat = displayLocation?.lat ?? displayLocation?.latitude;
  const displayLng = displayLocation?.lng ?? displayLocation?.longitude;
  const displayAccuracy = displayLocation?.accuracy;
  const liveActive = String(liveLocationStatus || detail?.liveLocation?.status || '').toLowerCase() === 'active';
  
  const hasFrontImage = !!mediaUrls.front;
  const hasBackImage = !!mediaUrls.back;
  const hasAudio = !!mediaUrls.audio;

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E4002B" />
          <Text style={styles.loadingText}>Loading SOS details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />

      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>SOS Active</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Status */}
        <View style={styles.statusContainer}>
          <View style={styles.statusBadge}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>ACTIVE</Text>
          </View>
          <Text style={styles.statusMessage}>{detail?.emergencyMessage || 'Emergency SOS triggered'}</Text>
          <Text style={styles.statusTime}>
            {detail?.createdAt ? new Date(detail.createdAt).toLocaleString() : 'Time unknown'}
          </Text>
        </View>

        {/* Location Card */}
        {displayLat != null && displayLng != null && (
          <TouchableOpacity style={styles.locationCard} onPress={handleOpenLocation} activeOpacity={0.8}>
            <View style={styles.locationHeader}>
              <Text style={styles.locationLabel}>📍 {liveActive ? 'LIVE LOCATION' : 'LOCATION'}</Text>
              {liveActive && (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              )}
            </View>
            <Text style={styles.locationCoords}>
              {Number(displayLat).toFixed(6)}, {Number(displayLng).toFixed(6)}
            </Text>
            <Text style={styles.locationAccuracy}>
              {displayAccuracy != null ? `±${displayAccuracy}m accuracy` : 'Accuracy unknown'}
            </Text>
            <Text style={styles.locationUpdated}>Updated: {locationUpdateTime}</Text>
            <Text style={styles.locationTap}>Tap to open in Google Maps</Text>
          </TouchableOpacity>
        )}

        {/* Emergency Link */}
        {detail?.emergencyLink && (
          <TouchableOpacity style={styles.linkCard} onPress={() => Linking.openURL(detail.emergencyLink)}>
            <Text style={styles.linkLabel}>🔗 EMERGENCY TRACKING LINK</Text>
            <Text style={styles.linkText}>{detail.emergencyLink}</Text>
          </TouchableOpacity>
        )}

        {/* ================= PHOTOS - FIXED ================= */}
        {(hasFrontImage || hasBackImage) && (
          <View style={styles.mediaSection}>
            <Text style={styles.mediaLabel}>📷 PHOTOS</Text>
            <View style={styles.photosGrid}>
              {hasFrontImage && !hiddenImages.front && (
                <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(mediaUrls.front)}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Front</Text></View>
                  <Image
                    source={{ uri: mediaUrls.front, headers: authHeaders }}
                    style={styles.photoImage}
                    onError={() => setHiddenImages(prev => ({...prev, front: true}))}
                  />
                </TouchableOpacity>
              )}
              {hasBackImage && !hiddenImages.back && (
                <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(mediaUrls.back)}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Back</Text></View>
                  <Image
                    source={{ uri: mediaUrls.back, headers: authHeaders }}
                    style={styles.photoImage}
                    onError={() => setHiddenImages(prev => ({...prev, back: true}))}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ================= AUDIO - SINGLE INSTANCE ================= */}
        <View style={styles.mediaSection}>
          <Text style={styles.mediaLabel}>🎙️ VOICE RECORDING</Text>
          {hasAudio ? (
            <View style={styles.audioCard}>
              <AudioPlayer
                audioUrl={mediaUrls.audio}
                token={token}
                publicMedia={false}
                directFetch={true}
                onError={(err) => console.log('[Audio Error]', err)}
              />
            </View>
          ) : (
            <Text style={styles.noMediaText}>No audio recording available.</Text>
          )}
        </View>

        {/* Stop Sharing */}
        {liveActive && (
          <TouchableOpacity style={styles.stopButton} onPress={handleStopSharing} disabled={stopping}>
            <Text style={styles.stopButtonText}>{stopping ? 'Stopping...' : 'Stop Sharing'}</Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

      </ScrollView>

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
  safeArea: { flex: 1, backgroundColor: '#F7F7F8' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: 16, fontSize: 14, color: '#6B7280', fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEF0',
  },

  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A', flex: 1, textAlign: 'center' },
  headerRight: { width: 40 },

  scrollContent: { padding: 16, paddingBottom: 30 },

  statusContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    marginBottom: 14,
  },

  statusBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDE7EA', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E4002B', marginRight: 8 },
  statusText: { fontSize: 12, fontWeight: '900', color: '#E4002B' },
  statusMessage: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginTop: 12, textAlign: 'center' },
  statusTime: { fontSize: 12, color: '#A1A1A6', marginTop: 6 },

  locationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    marginBottom: 12,
  },

  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  locationLabel: { fontSize: 12, fontWeight: '900', color: '#6E6E73' },

  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDE7EA', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B', marginRight: 5 },
  liveText: { fontSize: 8, fontWeight: '900', color: '#E4002B' },

  locationCoords: { fontSize: 15, fontWeight: '700', color: '#1A73E8', marginTop: 8 },
  locationAccuracy: { fontSize: 12, color: '#6E6E73', marginTop: 4 },
  locationUpdated: { fontSize: 11, color: '#A1A1A6', marginTop: 4 },
  locationTap: { fontSize: 12, color: '#E4002B', fontWeight: '700', marginTop: 8 },

  linkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    marginBottom: 12,
  },

  linkLabel: { fontSize: 10, fontWeight: '900', color: '#6E6E73' },
  linkText: { fontSize: 12, color: '#E4002B', fontWeight: '700', marginTop: 4 },

  mediaSection: { marginBottom: 12 },
  mediaLabel: { fontSize: 12, fontWeight: '900', color: '#6E6E73', marginBottom: 8 },

  photosGrid: { flexDirection: 'row', gap: 10 },
  photoBox: { flex: 1, aspectRatio: 4 / 3, backgroundColor: '#F5F6F8', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#E8E8EB' },
  photoBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, zIndex: 1 },
  photoBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF' },
  photoImage: { width: '100%', height: '100%', resizeMode: 'cover' },

  audioCard: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#E8E8EB' },
  noMediaText: { color: '#A1A1A6', fontSize: 13, textAlign: 'center', padding: 12 },

  stopButton: {
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#F3B5BF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },

  stopButtonText: { color: '#D9263A', fontSize: 14, fontWeight: '800' },

  errorText: { color: '#B42318', fontSize: 13, textAlign: 'center', marginTop: 12 },

  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText2: { fontSize: 16, color: '#B42318', fontWeight: '700', marginBottom: 16 },
  errorBackButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E4002B' },
  errorBackText: { color: '#FFFFFF', fontWeight: '700' },
});

export default UserSosActiveScreen;