// UserNotificationDetailScreen.js - COMPLETE FIXED with LiveLocationMap and Audio
import React, {useEffect, useState} from 'react';
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
import LiveLocationMap from '../components/LiveLocationMap';
import {API_BASE_URL} from '../api/config';
import {getSos} from '../api/resources';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import FullscreenImageViewer from '../components/FullscreenImageViewer';

const UserNotificationDetailScreen = ({notification, onBack, onViewSos, token}) => {
  const insets = useSafeAreaInsets();

  const sosId = notification?.sosId && typeof notification.sosId === 'object'
    ? notification.sosId._id || notification.sosId.id
    : notification?.sosId;

  const initialSos = notification?.sosId && typeof notification.sosId === 'object'
    ? notification.sosId
    : null;

  const [detail, setDetail] = useState(initialSos);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});
  const [selectedImage, setSelectedImage] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({front: null, back: null, audio: null});
  const [liveLocation, setLiveLocation] = useState(null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(null);
  const [audioError, setAudioError] = useState(null);

  // ================= Fetch SOS Detail =================
  const fetchSosDetail = async () => {
    if (!token || !sosId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await getSos(token, sosId, {forceRefresh: true});

      if (result?.sos) {
        const sosData = result.sos;
        setDetail(sosData);

        const components = sosData.components || {};

        const frontComp = components.frontImage;
        const backComp = components.backImage;
        const audioComp = components.audio;

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
          audioUrl: !!audioUrl
        });

        setMediaUrls({
          front: frontUrl,
          back: backUrl,
          audio: audioUrl,
        });

        // Extract live location
        if (sosData.liveLocation) {
          setLiveLocationStatus(sosData.liveLocation.status || null);
          if (sosData.liveLocation.lastLocation) {
            setLiveLocation(sosData.liveLocation.lastLocation);
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

  const currentSos = detail || initialSos;
  const authHeaders = {Authorization: `Bearer ${token}`};

  const frontMediaUrl = mediaUrls.front;
  const backMediaUrl = mediaUrls.back;
  const audioMediaUrl = mediaUrls.audio;

  const hasFrontImage = !!frontMediaUrl;
  const hasBackImage = !!backMediaUrl;
  const hasAudio = !!audioMediaUrl;
  const hasImageData = hasFrontImage || hasBackImage;

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
      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <Text style={styles.title}>Notification</Text>
        <View style={styles.headerRight} />
      </View>

      {notification ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Notification Header */}
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

          {/* SOS Status */}
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

          {/* ================= LIVE LOCATION MAP ================= */}
          {currentSos && sosId && (
            <LiveLocationMap
              sosId={sosId}
              token={token}
              initialLocation={liveLocation || currentSos?.liveLocation?.lastLocation}
              initialStatus={liveLocationStatus || currentSos?.liveLocation?.status}
              onLocationUpdate={(location, status) => {
                setLiveLocation(location);
                setLiveLocationStatus(status);
              }}
            />
          )}

          {/* Emergency Link */}
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
                    <View style={styles.photoBadge}>
                      <Text style={styles.photoBadgeText}>Front</Text>
                    </View>
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
                    <View style={styles.photoBadge}>
                      <Text style={styles.photoBadgeText}>Back</Text>
                    </View>
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

          {/* ================= AUDIO ================= */}
          <View style={styles.mediaSection}>
            <Text style={styles.mediaTitle}>🎙️ VOICE RECORDING</Text>
            {hasAudio ? (
              <View style={styles.audioCard}>
                <AudioPlayer
                  audioUrl={audioMediaUrl}
                  token={token}
                  publicMedia={false}
                  style={styles.audioPlayer}
                  onError={(err) => {
                    console.log('[Audio Error]', err);
                    setAudioError(err?.message || 'Audio playback failed');
                  }}
                />
              </View>
            ) : (
              <Text style={styles.noMediaText}>No audio recording available.</Text>
            )}
          </View>

          {/* View SOS Details */}
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