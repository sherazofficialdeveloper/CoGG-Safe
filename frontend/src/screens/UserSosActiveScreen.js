// UserSosActiveScreen.js - FIXED (Map Style)
import React, { useEffect, useState } from 'react';
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
  Dimensions,
} from 'react-native';
import { getSos, getLiveLocation, stopLiveLocation } from '../api/resources';
import { API_BASE_URL } from '../api/config';
import AudioPlayer from '../components/AudioPlayer';
import FullscreenImageViewer from '../components/FullscreenImageViewer';
import Icon from '../components/Icon';

const { width: screenWidth } = Dimensions.get('window');

const UserSosActiveScreen = ({ sos, token, onBack }) => {
  const [detail, setDetail] = useState(sos || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [stopping, setStopping] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [hiddenImages, setHiddenImages] = useState({ front: false, back: false });
  const [mediaUrls, setMediaUrls] = useState({ front: null, back: null, audio: null });

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
        const result = await getSos(token, recordId, { forceRefresh: true });
        if (mounted && result?.sos) {
          const sosData = result.sos;
          setDetail(sosData);

          const components = sosData.components || {};
          setMediaUrls({
            front: components.frontImage?.storageRef ? `${API_BASE_URL}/sos/${recordId}/media/frontImage/file` : null,
            back: components.backImage?.storageRef ? `${API_BASE_URL}/sos/${recordId}/media/backImage/file` : null,
            audio: components.audio?.storageRef ? `${API_BASE_URL}/sos/${recordId}/media/audio/file` : null,
          });

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
        const result = await getLiveLocation(token, recordId, { limit: 1 }, { forceRefresh: true });
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

  const authHeaders = { Authorization: `Bearer ${token}` };
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

        {/* ================= LOCATION - MAP STYLE ================= */}
        {displayLat != null && displayLng != null && (
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

            <TouchableOpacity style={styles.mapContainer} activeOpacity={0.9} onPress={handleOpenLocation}>
              {/* Map Grid Background */}
              <View style={styles.mapGrid}>
                <View style={[styles.mapStreet, styles.mapStreet1]} />
                <View style={[styles.mapStreet, styles.mapStreet2]} />
                <View style={[styles.mapStreet, styles.mapStreet3]} />
                <View style={[styles.mapStreet, styles.mapStreet4]} />
                <View style={[styles.mapBuilding, styles.mapBuilding1]} />
                <View style={[styles.mapBuilding, styles.mapBuilding2]} />
                <View style={[styles.mapBuilding, styles.mapBuilding3]} />
                <View style={[styles.mapBuilding, styles.mapBuilding4]} />

                {/* Location Marker with Pulse */}
                <View style={styles.markerContainer}>
                  <View style={styles.pulseRing1} />
                  <View style={styles.pulseRing2} />
                  <View style={styles.markerOuter}>
                    <View style={styles.markerInner}>
                      <View style={styles.markerDot} />
                    </View>
                  </View>
                </View>
              </View>

              {/* Location Overlay */}
              <View style={styles.mapOverlay}>
                <View style={styles.mapOverlayTop}>
                  <View style={styles.mapOverlayIconContainer}>
                    <Text style={styles.mapOverlayIcon}>📍</Text>
                  </View>
                  <View style={styles.mapOverlayContent}>
                    <Text style={styles.mapOverlayTitle}>
                      {liveActive ? 'Live GPS Location' : 'Last Known Location'}
                    </Text>
                    <Text style={styles.mapOverlayCoords}>
                      {Number(displayLat).toFixed(6)}, {Number(displayLng).toFixed(6)}
                    </Text>
                  </View>
                </View>
                <View style={styles.mapOverlayBottom}>
                  <Text style={styles.mapOverlayAccuracy}>
                    {displayAccuracy != null ? `±${displayAccuracy}m accuracy` : 'Accuracy: Unknown'}
                  </Text>
                  <Text style={styles.mapOverlayTime}>
                    Updated: {locationUpdateTime}
                  </Text>
                </View>
              </View>

              <View style={styles.mapTapHint}>
                <Text style={styles.mapTapHintText}>Tap to open in Google Maps</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Emergency Link */}
        {detail?.emergencyLink && (
          <TouchableOpacity style={styles.linkCard} onPress={() => Linking.openURL(detail.emergencyLink)}>
            <Text style={styles.linkLabel}>🔗 EMERGENCY TRACKING LINK</Text>
            <Text style={styles.linkText}>{detail.emergencyLink}</Text>
          </TouchableOpacity>
        )}

        {/* Photos */}
        {(hasFrontImage || hasBackImage) && (
          <View style={styles.mediaSection}>
  <Text style={styles.mediaLabel}>🎙️ VOICE RECORDING</Text>
  {hasAudio ? (
    <View style={styles.audioCard}>
      <AudioPlayer
        audioUrl={mediaUrls.audio}
        token={token}
        publicMedia={false}
        directFetch={true}  // ================= NEW: Direct fetch mode =================
        onError={(err) => console.log('[Audio Error]', err)}
      />
    </View>
  ) : (
    <Text style={styles.noMediaText}>No audio recording available.</Text>
  )}
</View>
        )}

        {/* Audio */}
        <View style={styles.mediaSection}>
          <Text style={styles.mediaLabel}>🎙️ VOICE RECORDING</Text>
          {hasAudio ? (
            <View style={styles.audioCard}>
              <AudioPlayer
                audioUrl={mediaUrls.audio}
                token={token}
                publicMedia={false}
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

  // ================= LOCATION MAP STYLES =================
  locationSection: { marginBottom: 12 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  locationLabel: { fontSize: 12, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8 },

  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDE7EA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B', marginRight: 5 },
  liveText: { fontSize: 8, fontWeight: '900', color: '#E4002B', letterSpacing: 0.5 },

  mapContainer: {
    width: '100%',
    height: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8EDF3',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  mapGrid: { width: '100%', height: '100%', position: 'relative' },

  mapStreet: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.3)' },
  mapStreet1: { top: '25%', left: '-10%', right: '-10%', height: 3, transform: [{ rotate: '-3deg' }] },
  mapStreet2: { top: '55%', left: '-10%', right: '-10%', height: 3, transform: [{ rotate: '2deg' }] },
  mapStreet3: { top: '-10%', bottom: '-10%', left: '30%', width: 3, transform: [{ rotate: '5deg' }] },
  mapStreet4: { top: '-10%', bottom: '-10%', right: '25%', width: 3, transform: [{ rotate: '-4deg' }] },

  mapBuilding: { position: 'absolute', backgroundColor: 'rgba(160,180,200,0.25)', borderRadius: 2 },
  mapBuilding1: { top: '10%', left: '15%', width: '18%', height: '12%' },
  mapBuilding2: { top: '8%', right: '20%', width: '14%', height: '10%' },
  mapBuilding3: { bottom: '15%', left: '20%', width: '20%', height: '14%' },
  mapBuilding4: { bottom: '12%', right: '15%', width: '16%', height: '12%' },

  markerContainer: { position: 'absolute', top: '45%', left: '47%', alignItems: 'center', justifyContent: 'center' },
  pulseRing1: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 2, borderColor: 'rgba(228,0,43,0.15)', top: -22, left: -22 },
  pulseRing2: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: 'rgba(228,0,43,0.25)', top: -12, left: -12 },
  markerOuter: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(228,0,43,0.15)', alignItems: 'center', justifyContent: 'center' },
  markerInner: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(228,0,43,0.3)', alignItems: 'center', justifyContent: 'center' },
  markerDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#E4002B', shadowColor: '#E4002B', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },

  mapOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    padding: 10,
  },

  mapOverlayTop: { flexDirection: 'row', alignItems: 'center' },
  mapOverlayIconContainer: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  mapOverlayIcon: { fontSize: 14 },
  mapOverlayContent: { flex: 1 },
  mapOverlayTitle: { fontSize: 11, fontWeight: '900', color: '#1A73E8' },
  mapOverlayCoords: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', marginTop: 1 },
  mapOverlayBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  mapOverlayAccuracy: { fontSize: 10, color: '#6E6E73' },
  mapOverlayTime: { fontSize: 10, color: '#6E6E73' },

  mapTapHint: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  mapTapHintText: { fontSize: 8, color: '#FFFFFF', fontWeight: '600' },

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