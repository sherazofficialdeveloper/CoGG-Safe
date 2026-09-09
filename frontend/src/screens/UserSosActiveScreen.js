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
import {getSos, stopLiveLocation} from '../api/resources';
import {API_BASE_URL} from '../api/config';
import {buildMediaUrl} from '../utils/media';
import Icon from '../components/Icon';
import SosMediaSection from '../components/SosMediaSection';

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
            ? buildMediaUrl(API_BASE_URL, recordId, 'frontImage')
            : null;

          const backUrl = backComp && backComp.storageRef
            ? buildMediaUrl(API_BASE_URL, recordId, 'backImage')
            : null;

          const audioUrl = audioComp && audioComp.storageRef
            ? buildMediaUrl(API_BASE_URL, recordId, 'audio')
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

  const authHeaders = {Authorization: `Bearer ${token}`};
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

        <SosMediaSection
          sosId={recordId}
          token={token}
          sos={detail}
          mediaUrls={mediaUrls}
          initialLocation={liveLocation || detail?.liveLocation?.lastLocation || detail?.location}
          initialStatus={liveLocationStatus || detail?.liveLocation?.status}
          showStopButton={liveActive}
          isStopping={stopping}
          onStopSharing={handleStopSharing}
          onLocationUpdate={(location, status) => {
            setLiveLocation(location);
            setLiveLocationStatus(status);
          }}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

      </ScrollView>
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