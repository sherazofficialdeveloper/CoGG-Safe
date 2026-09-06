import React, {useEffect, useState} from 'react';
import {Image, Linking, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getSos, getLiveLocation, stopLiveLocation} from '../api/resources';
import {API_BASE_URL} from '../api/config';
import {getCachedApiData} from '../api/client';
import {sosLocalStore} from '../features/sos/storage';
import {stopLiveLocationSharing} from '../features/sos/services/liveLocationService';
import AudioPlayer from '../components/AudioPlayer';
import FullscreenImageViewer from '../components/FullscreenImageViewer';

// Same "success"-style component states the admin detail screen accepts —
// kept identical so a component that shows on Admin also shows here.
const hasStoredMediaStatus = component =>
  ['success', 'uploaded', 'ready', 'completed'].includes(String(component?.status || '').toLowerCase())
  && (Boolean(component?.storageRef) || Boolean(component?.localPath));

const UserSosActiveScreen = ({sos, token, onBack}) => {
  const [detail, setDetail] = useState(sos || null);
  const [error, setError] = useState('');
  const [liveLocation, setLiveLocation] = useState(null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [stopping, setStopping] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});
  const recordId = detail?.id || detail?._id || sos?.id || sos?._id;
  const normalizedStatus = String(detail?.status || 'active').toLowerCase();
  const liveActive = String(liveLocation?.status || detail?.liveLocation?.status || '').toLowerCase() === 'active';

  useEffect(() => {
    setError('');
    if (!token || !recordId) return undefined;
    const cached = getCachedApiData(`/sos/${recordId}`, token);
    if (cached?.sos) setDetail(cached.sos);
    let mounted = true;
    getSos(token, recordId)
      .then(result => mounted && result?.sos && setDetail(result.sos))
      .catch(requestError => mounted && setError(requestError.message || 'Unable to load SOS details.'));
    return () => { mounted = false; };
  }, [recordId, token]);

  // Same "poll every 5s, no manual refresh" pattern used by the admin
  // detail screen (AdminSosDetailScreen) — this is the reference
  // implementation for real-time updates without sockets.
  useEffect(() => {
    if (!token || !recordId) return undefined;
    let mounted = true;
    const refresh = async () => {
      try {
        const localEvent = await sosLocalStore.getSosById(recordId);
        if (mounted && localEvent) setDetail(current => ({...(current || {}), ...localEvent}));
        const backendId = localEvent?.backendId || detail?.backendId || recordId;
        if (!backendId) return;
        const [sosResult, liveResult] = await Promise.all([
          getSos(token, backendId, {forceRefresh: true}),
          getLiveLocation(token, backendId, {limit: 1}, {forceRefresh: true}),
        ]);
        if (!mounted) return;
        if (sosResult?.sos) setDetail(current => ({...(current || {}), ...sosResult.sos, backendId}));
        const latest = liveResult?.liveLocation?.lastLocation || liveResult?.pings?.[0] || null;
        setLiveLocation({
          ...(liveResult?.liveLocation || {}),
          lastLocation: latest,
        });
        if (latest) setLocationUpdateTime(latest.capturedAt ? new Date(latest.capturedAt).toLocaleString() : 'Just now');
      } catch (_) { /* live location is best-effort; detail remains usable */ }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => { mounted = false; clearInterval(timer); };
  }, [recordId, token, detail?.backendId]);

  const handleStopSharing = async () => {
    const backendId = detail?.backendId || recordId;
    if (!backendId || stopping || !liveActive) return;
    setStopping(true);
    setError('');
    try {
      const response = await stopLiveLocationSharing({token, sosId: recordId, backendId});
      if (response?.sos) {
        setDetail(response.sos);
        setLiveLocation(response.sos.liveLocation || null);
      }
    } catch (stopError) {
      setError(stopError?.message || 'Unable to stop live location.');
    } finally {
      setStopping(false);
    }
  };

  // ---- Media URL resolution (mirrors AdminSosDetailScreen) ----
  // Prefer the public, token-gated /emergency/:token/media/:component
  // route (works with no Authorization header, same route the shared
  // SOS token page already uses successfully). Only fall back to the
  // authenticated /sos/:id/media/:component/file route — which DOES
  // require a Bearer header — when the public route isn't available
  // (e.g. record has no emergencyLink yet, or media was never public).
  const getPublicMediaUrl = componentName => {
    const exact = detail?.emergencyMediaUrls?.[componentName];
    if (exact) return exact;
    const match = String(detail?.emergencyLink || '').match(/\/([^/]+)\/?$/);
    return match?.[1] ? `${API_BASE_URL}/emergency/${match[1]}/media/${componentName}` : null;
  };
  const resolveMediaSource = componentName => {
    const publicUrl = getPublicMediaUrl(componentName);
    if (publicUrl) return {url: publicUrl, isPublic: true};
    const component = detail?.components?.[componentName];
    if (recordId && hasStoredMediaStatus(component)) {
      return {url: `${API_BASE_URL}/sos/${recordId}/media/${componentName}/file`, isPublic: false};
    }
    return {url: null, isPublic: false};
  };
  const frontMediaSource = resolveMediaSource('frontImage');
  const backMediaSource = resolveMediaSource('backImage');
  const audioMediaSource = resolveMediaSource('audio');
  const authHeaders = {Authorization: `Bearer ${token}`};

  const hasImageData = Boolean(
    (frontMediaSource.url && !hiddenImages.front) || (backMediaSource.url && !hiddenImages.back)
  );

  // ---- Location / GPS link (mirrors AdminSosDetailScreen) ----
  const displayLocation = liveLocation?.lastLocation || detail?.liveLocation?.lastLocation || detail?.location || null;
  const displayLat = displayLocation?.lat ?? displayLocation?.latitude;
  const displayLng = displayLocation?.lng ?? displayLocation?.longitude;
  const displayAccuracy = displayLocation?.accuracy;
  const hasLocationData = displayLat != null && displayLng != null;
  const gpsMapsUrl = hasLocationData ? `https://www.google.com/maps?q=${displayLat},${displayLng}` : null;
  const initialLocation = detail?.location;
  const hasInitialLocation = initialLocation?.latitude != null && initialLocation?.longitude != null;

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>SOS unavailable</Text>
        <Text style={styles.text}>{error || 'The emergency record could not be loaded.'}</Text>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>Back</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.content}>
          <Text style={styles.title}>SOS status</Text>
          <Text style={styles.status}>{String(detail.status || 'active').toUpperCase()}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* ================= LIVE LOCATION CARD ================= */}
        {hasLocationData ? (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionLabel}>📍 {liveActive ? 'LIVE LOCATION' : 'LOCATION'}</Text>
              {liveActive ? (
                <View style={styles.liveBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.card} onPress={() => gpsMapsUrl && Linking.openURL(gpsMapsUrl)} activeOpacity={0.8}>
              <Text style={styles.coords}>
                {Number(displayLat).toFixed(5)}°, {Number(displayLng).toFixed(5)}°
              </Text>
              <Text style={styles.accuracy}>
                {displayAccuracy != null ? `±${displayAccuracy}m accuracy` : 'Accuracy unavailable'}
              </Text>
              <Text style={styles.updateTime}>Updated {locationUpdateTime}</Text>
              <Text style={styles.gpsLinkText}>Open current location in Google Maps</Text>
            </TouchableOpacity>
            {hasInitialLocation ? (
              <Text style={styles.initialLocationText}>
                Initial SOS location: {Number(initialLocation.latitude).toFixed(5)}, {Number(initialLocation.longitude).toFixed(5)}
              </Text>
            ) : null}
            {liveActive ? (
              <TouchableOpacity style={styles.stopSharingButton} onPress={handleStopSharing} disabled={stopping}>
                <Text style={styles.stopSharingText}>{stopping ? 'Stopping...' : 'Stop Sharing Live Location'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📍 LOCATION</Text>
            <Text style={styles.mutedText}>Location not available yet.</Text>
          </View>
        )}

        {/* ================= GPS SHARE LINK ================= */}
        {detail?.emergencyLink ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>🔗 EMERGENCY TRACKING LINK</Text>
            <TouchableOpacity style={styles.card} onPress={() => Linking.openURL(detail.emergencyLink)} activeOpacity={0.8}>
              <Text style={styles.linkCardText}>{detail.emergencyLink}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ================= PHOTOS ================= */}
        {hasImageData ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>📷 CAMERA SNAPS</Text>
            <View style={styles.photosGrid}>
              {frontMediaSource.url && !hiddenImages.front ? (
                <View style={styles.photoBox}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Front</Text></View>
                  <TouchableOpacity onPress={() => setSelectedImage(frontMediaSource.url)} activeOpacity={0.85}>
                    <Image
                      source={frontMediaSource.isPublic ? {uri: frontMediaSource.url} : {uri: frontMediaSource.url, headers: authHeaders}}
                      style={styles.photoImage}
                      onError={() => setHiddenImages(current => ({...current, front: true}))}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}
              {backMediaSource.url && !hiddenImages.back ? (
                <View style={styles.photoBox}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Back</Text></View>
                  <TouchableOpacity onPress={() => setSelectedImage(backMediaSource.url)} activeOpacity={0.85}>
                    <Image
                      source={backMediaSource.isPublic ? {uri: backMediaSource.url} : {uri: backMediaSource.url, headers: authHeaders}}
                      style={styles.photoImage}
                      onError={() => setHiddenImages(current => ({...current, back: true}))}
                    />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* ================= VOICE RECORDING ================= */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>🎙️ VOICE RECORDING</Text>
          {audioMediaSource.url ? (
            <View style={styles.card}>
              <AudioPlayer audioUrl={audioMediaSource.url} token={token} publicMedia={audioMediaSource.isPublic} />
            </View>
          ) : (
            <Text style={styles.mutedText}>No voice recording available yet.</Text>
          )}
        </View>
      </ScrollView>

      <FullscreenImageViewer
        visible={Boolean(selectedImage)}
        uri={selectedImage}
        headers={authHeaders}
        onClose={() => setSelectedImage(null)}
      />

      <TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backText}>Back to Home</Text></TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F7F7F8'},
  scrollContent: {padding: 20, paddingBottom: 12},
  content: {alignItems: 'center'},
  title: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', textAlign: 'center'},
  status: {fontSize: 28, fontWeight: '900', color: '#E4002B', marginTop: 12},
  text: {fontSize: 15, color: '#59636E', textAlign: 'center', marginTop: 12, lineHeight: 22},
  error: {fontSize: 13, color: '#B42318', textAlign: 'center', marginTop: 10},
  link: {color: '#E4002B', textAlign: 'center', marginTop: 20},

  section: {marginTop: 22},
  sectionHeaderRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8},
  sectionLabel: {fontSize: 12, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8, marginBottom: 8},
  mutedText: {fontSize: 13, color: '#A1A1A6'},

  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 14,
    padding: 14,
  },

  coords: {fontSize: 15, fontWeight: '800', color: '#1A73E8'},
  accuracy: {fontSize: 12, color: '#6E6E73', marginTop: 4},
  updateTime: {fontSize: 11, color: '#A1A1A6', marginTop: 6},
  gpsLinkText: {fontSize: 13, fontWeight: '700', color: '#E4002B', marginTop: 10},
  initialLocationText: {fontSize: 11, color: '#A1A1A6', marginTop: 8},
  linkCardText: {color: '#E4002B', fontSize: 13, fontWeight: '700'},

  liveBadge: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FDE5E8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12},
  liveDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B'},
  liveText: {fontSize: 10, fontWeight: '900', color: '#E4002B'},

  stopSharingButton: {backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E4002B', borderRadius: 12, paddingVertical: 14, marginTop: 14, alignItems: 'center'},
  stopSharingText: {color: '#E4002B', fontWeight: '900'},

  photosGrid: {flexDirection: 'row', gap: 10},
  photoBox: {flex: 1, aspectRatio: 4 / 3, backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 14, overflow: 'hidden', position: 'relative'},
  photoBadge: {position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, zIndex: 1},
  photoBadgeText: {fontSize: 8, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5},
  photoImage: {width: '100%', height: '100%'},

  backButton: {backgroundColor: '#E4002B', paddingVertical: 16, borderRadius: 12, margin: 20, marginTop: 8, alignItems: 'center'},
  backText: {color: '#FFF', fontWeight: '800'},
});

export default UserSosActiveScreen;
