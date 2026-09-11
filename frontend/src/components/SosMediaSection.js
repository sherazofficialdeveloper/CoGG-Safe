import React, {useState} from 'react';
import {Image, Linking, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
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
}) => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [hidden, setHidden] = useState({front: false, back: false});

  const authHeaders = buildMediaRequestOptions(token).headers;

  // Screens may already provide resolved media URLs. If they do not, derive
  // them from the canonical SOS component storage references here so the
  // shared media layer remains the single source of truth.
  const componentHasMedia = component => Boolean(component?.storageRef || component?.url || component?.path);
  const urls = {
    front: providedMediaUrls?.front || (sosId && componentHasMedia(sos?.components?.frontImage) ? buildMediaUrl(API_BASE_URL, sosId, 'frontImage') : null),
    back: providedMediaUrls?.back || (sosId && componentHasMedia(sos?.components?.backImage) ? buildMediaUrl(API_BASE_URL, sosId, 'backImage') : null),
    audio: providedMediaUrls?.audio || (sosId && componentHasMedia(sos?.components?.audio) ? buildMediaUrl(API_BASE_URL, sosId, 'audio') : null),
  };
  const hasImages = Boolean(urls.front || urls.back);

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
        {hasImages ? (
          <View style={styles.photosGrid}>
            {urls.front && !hidden.front ? (
              <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(urls.front)}>
                <View style={styles.badge}><Text style={styles.badgeText}>Front</Text></View>
                <Image source={{uri: urls.front, headers: authHeaders}} style={styles.photo} onError={() => setHidden(v => ({...v, front: true}))} />
              </TouchableOpacity>
            ) : null}
            {urls.back && !hidden.back ? (
              <TouchableOpacity style={styles.photoBox} onPress={() => setSelectedImage(urls.back)}>
                <View style={styles.badge}><Text style={styles.badgeText}>Back</Text></View>
                <Image source={{uri: urls.back, headers: authHeaders}} style={styles.photo} onError={() => setHidden(v => ({...v, back: true}))} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : <Text style={styles.empty}>No photos available.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>🎙️ VOICE RECORDING</Text>
        {urls.audio ? (
          <View style={styles.audioCard}>
            <AudioPlayer audioUrl={urls.audio} token={token} publicMedia={true} directFetch={true} style={styles.audio} />
          </View>
        ) : <Text style={styles.empty}>No audio recording available.</Text>}
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
  audioCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 4},
  audio: {width: '100%'},
  empty: {color: '#A1A1A6', fontSize: 13, textAlign: 'center', padding: 12},
  linkSection: {marginBottom: 16},
  linkCard: {backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8E8EB', borderRadius: 12, padding: 12},
  linkText: {color: '#E4002B', fontSize: 12, fontWeight: '700'},
});

export default SosMediaSection;
