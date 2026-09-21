import React, {useState} from 'react';
import {ActivityIndicator, Image, Linking, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import AudioPlayer from './AudioPlayer';
import LiveLocationMap from './LiveLocationMap';
import FullscreenImageViewer from './FullscreenImageViewer';
import {buildMediaRequestOptions, buildMediaUrl} from '../utils/media';
import {API_BASE_URL} from '../api/config';

/**
 * Single media presentation boundary for SOS/notification detail screens.
 * Media URL construction, authenticated image rendering, audio and live map
 * presentation live here so screen implementations do not diverge.
 */
const SosMediaSection = ({
  sosId,
  token,
  sos,
  mediaUrls: providedMediaUrls = null,
  initialLocation = null,
  initialStatus = null,
  showStopButton = false,
  isStopping = false,
  onStopSharing,
  onLocationUpdate,
  showEmergencyLink = true,
  compact = false,
  // Forwarded to LiveLocationMap - only the post-SOS-trigger screen sets
  // this (see UserSosActiveScreen). Defaults to false everywhere else so
  // Admin/notification detail screens keep their existing behavior.
  justTriggered = false,
}) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [hidden, setHidden] = useState({front: false, back: false});

  const authHeaders = buildMediaRequestOptions(token).headers;

  // Screens may already provide resolved media URLs. If they do not, derive
  // them from the canonical SOS component storage references here so the
  // shared media layer remains the single source of truth.
  const componentHasMedia = component => Boolean(component?.storageRef || component?.url || component?.path);

  // ================= PUBLIC EMERGENCY BASE URL =================
  // The private /api/sos/... media route requires a Bearer token that a
  // native media downloader cannot always attach. The public
  // /api/emergency/... route is unauthenticated (guarded only by the
  // cryptographic emergency token) and returns the same audio bytes.
  // API_BASE_URL already ends in /api (or /api/v1), so strip that suffix
  // before appending /api/emergency/... — otherwise the URL becomes
  // .../api/api/emergency/... and every request 404s.
  const PUBLIC_BASE_URL = API_BASE_URL.replace(/\/api(\/v\d+)?\/?$/, '');

  const publicAudioUrl = sos?.emergencyToken
    ? `${PUBLIC_BASE_URL}/api/emergency/${sos.emergencyToken}/media/audio`
    : null;

  // A public emergency media URL carries its own authorization in the path,
  // so it must be requested WITHOUT an Authorization header. Recognise it by
  // shape instead of by object identity: the URL can come from the backend
  // (sos.emergencyMediaUrls) or be built locally, and comparing references
  // silently mislabelled the backend-provided one as private.
  const isPublicEmergencyUrl = url =>
    typeof url === 'string' && /\/api\/emergency\/[^/]+\/media\//.test(url);

  // The authenticated route serves the file for any SOS status; the public
  // emergency route only serves it while the SOS is ACTIVE, but needs no
  // header. Neither one is reliable on its own on every device, so both are
  // handed to the player and it falls back automatically.
  const authenticatedAudioUrl = sosId && componentHasMedia(sos?.components?.audio)
    ? buildMediaUrl(API_BASE_URL, sosId, 'audio')
    : null;
  const emergencyAudioUrl = sos?.emergencyMediaUrls?.audio || publicAudioUrl;

  const urls = {
    front: providedMediaUrls?.front || (sosId && componentHasMedia(sos?.components?.frontImage) ? buildMediaUrl(API_BASE_URL, sosId, 'frontImage') : null),
    back: providedMediaUrls?.back || (sosId && componentHasMedia(sos?.components?.backImage) ? buildMediaUrl(API_BASE_URL, sosId, 'backImage') : null),
    audio: providedMediaUrls?.audio || authenticatedAudioUrl || emergencyAudioUrl,
  };

  // Whichever of the two routes is not being used as the primary source
  // becomes the retry source. Compare by route (ignoring any ?token=...
  // query the screen already appended) so the fallback is never just the
  // same URL again.
  const sameRoute = (a, b) =>
    Boolean(a) && Boolean(b) && String(a).split('?')[0] === String(b).split('?')[0];
  const audioFallbackCandidate = isPublicEmergencyUrl(urls.audio)
    ? authenticatedAudioUrl
    : emergencyAudioUrl;
  const audioFallbackUrl = sameRoute(audioFallbackCandidate, urls.audio)
    ? null
    : audioFallbackCandidate || null;

  const hasImages = Boolean(urls.front || urls.back);

  // Only meaningful (and only consulted) on the just-triggered screen: a
  // component with no url yet is either genuinely failed (backend said so)
  // or still capturing/uploading - which for a freshly-triggered SOS is the
  // common case, not an absence. componentHasMedia() being false already
  // covers "there is no url"; this only decides which message that maps to.
  const componentFailed = component => String(component?.status || '').toLowerCase() === 'failed';
  const frontPending = justTriggered && !urls.front && !componentFailed(sos?.components?.frontImage);
  const backPending = justTriggered && !urls.back && !componentFailed(sos?.components?.backImage);
  const audioPending = justTriggered && !urls.audio && !componentFailed(sos?.components?.audio);

  return (
    <View style={styles.root}>
      {sosId ? (
        <LiveLocationMap
          sosId={sosId}
          token={token}
          initialLocation={initialLocation || sos?.liveLocation?.lastLocation || sos?.location}
          initialStatus={initialStatus || sos?.liveLocation?.status}
          showStopButton={showStopButton}
          isStopping={isStopping}
          onStopSharing={onStopSharing}
          onLocationUpdate={onLocationUpdate}
          justTriggered={justTriggered}
        />
      ) : null}

      {showEmergencyLink && sos?.emergencyLink ? (
        <View style={styles.linkSection}>
          <Text style={styles.sectionLabel}>🔗 EMERGENCY TRACKING LINK</Text>
          <TouchableOpacity style={styles.linkCard} onPress={() => Linking.openURL(sos.emergencyLink)}>
            <Text style={styles.linkText}>{sos.emergencyLink}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>📷 PHOTOS</Text>
        {hasImages || frontPending || backPending ? (
          <View style={styles.photosGrid}>
            {urls.front && !hidden.front ? (
              <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(urls.front)}>
                <View style={styles.badge}><Text style={styles.badgeText}>Front</Text></View>
                <Image source={{uri: urls.front, headers: authHeaders}} style={styles.photo} onError={() => setHidden(v => ({...v, front: true}))} />
              </TouchableOpacity>
            ) : frontPending ? (
              <View style={[styles.photoBox, styles.photoBoxPending]}>
                <ActivityIndicator size="small" color="#E4002B" />
                <Text style={styles.photoPendingText}>Uploading…</Text>
              </View>
            ) : null}
            {urls.back && !hidden.back ? (
              <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(urls.back)}>
                <View style={styles.badge}><Text style={styles.badgeText}>Back</Text></View>
                <Image source={{uri: urls.back, headers: authHeaders}} style={styles.photo} onError={() => setHidden(v => ({...v, back: true}))} />
              </TouchableOpacity>
            ) : backPending ? (
              <View style={[styles.photoBox, styles.photoBoxPending]}>
                <ActivityIndicator size="small" color="#E4002B" />
                <Text style={styles.photoPendingText}>Uploading…</Text>
              </View>
            ) : null}
          </View>
        ) : <Text style={styles.empty}>No photos available.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>🎙️ VOICE RECORDING</Text>
        {urls.audio ? (
          <View style={styles.audioCard}>
            {/* Two routes can serve the same recording: the authenticated
                /sos/:id/media/audio/file one (works for any SOS status but
                needs a header/token) and the public /api/emergency/:token one
                (needs no header but only while the SOS is ACTIVE). The player
                tries the primary and automatically retries the other. */}
            <AudioPlayer
              audioUrl={urls.audio}
              token={isPublicEmergencyUrl(urls.audio) ? null : token}
              publicMedia={isPublicEmergencyUrl(urls.audio)}
              fallbackUrl={audioFallbackUrl}
              fallbackToken={isPublicEmergencyUrl(audioFallbackUrl) ? null : token}
              fallbackPublicMedia={isPublicEmergencyUrl(audioFallbackUrl)}
              style={styles.audio}
              fallbackDuration={6}
            />
          </View>
        ) : audioPending ? (
          <View style={[styles.audioCard, styles.audioPendingCard]}>
            <ActivityIndicator size="small" color="#E4002B" />
            <Text style={styles.audioPendingText}>Recording is uploading…</Text>
          </View>
        ) : <Text style={styles.empty}>No audio recorded for this SOS.</Text>}
      </View>

      <FullscreenImageViewer visible={Boolean(selectedImage)} uri={selectedImage} headers={authHeaders} onClose={() => setSelectedImage(null)} />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {width: '100%'},
  section: {marginBottom: 16},
  sectionLabel: {fontSize: 12, fontWeight: '900', color: '#6E6E73', marginBottom: 8},
  photosGrid: {flexDirection: 'row', gap: 10},
  photoBox: {flex: 1, aspectRatio: 4 / 3, backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 14, overflow: 'hidden', position: 'relative'},
  photo: {width: '100%', height: '100%', resizeMode: 'cover'},
  badge: {position: 'absolute', top: 8, left: 8, zIndex: 1, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6},
  badgeText: {fontSize: 8, fontWeight: '700', color: '#FFFFFF'},
  photoBoxPending: {alignItems: 'center', justifyContent: 'center'},
  photoPendingText: {fontSize: 10, color: '#9CA3AF', fontWeight: '600', marginTop: 6},
  audioCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 4},
  audioPendingCard: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 14, gap: 8},
  audioPendingText: {fontSize: 12, color: '#9CA3AF', fontWeight: '600'},
  audio: {width: '100%'},
  empty: {color: '#A1A1A6', fontSize: 13, textAlign: 'center', padding: 12},
  linkSection: {marginBottom: 16},
  linkCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 12},
  linkText: {color: '#E4002B', fontSize: 12, fontWeight: '700'},
});

export default SosMediaSection;