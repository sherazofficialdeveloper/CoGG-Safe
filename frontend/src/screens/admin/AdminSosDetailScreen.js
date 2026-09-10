// AdminSosDetailScreen.js - COMPLETE FIXED with LiveLocationMap Component
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
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import {deactivateSos, getLiveLocation, getSos, stopLiveLocation} from '../../api/resources';
import {API_BASE_URL} from '../../api/config';
import {buildMediaUrl} from '../../utils/media';
import SosMediaSection from '../../components/SosMediaSection';
import Icon from '../../components/Icon';

const {width: screenWidth} = Dimensions.get('window');

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
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});
  const [isLoading, setIsLoading] = useState(true);
  const [audioError, setAudioError] = useState(null);
  const [mediaUrls, setMediaUrls] = useState({front: null, back: null, audio: null});
  const [mediaTypes, setMediaTypes] = useState({front: false, back: false, audio: false});
  const detailRequestRef = useRef(0);
  const actionInFlightRef = useRef(false);

  const record = detailRecord || sos || {};
  const recordId = record.id || record._id;

  if (!recordId) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
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

  const isActive = record.status === 'Active' || record.status === 'active';

  // ================= Auth Headers =================
  const authHeaders = { Authorization: `Bearer ${token}` };

  // ================= Fetch Media from Backend =================
  const fetchMediaFromBackend = async () => {
    if (!token || !recordId) return;
    
    try {
      setIsLoading(true);
      
      const result = await getSos(token, recordId, {forceRefresh: true});
      if (result?.sos) {
        const sosData = result.sos;
        setDetailRecord(sosData);
        
        const components = sosData.components || {};
        
        const frontComp = components.frontImage;
        const backComp = components.backImage;
        const audioComp = components.audio;
        
        const frontUrl = frontComp?.storageRef 
          ? buildMediaUrl(API_BASE_URL, recordId, 'frontImage')
          : null;
        
        const backUrl = backComp?.storageRef 
          ? buildMediaUrl(API_BASE_URL, recordId, 'backImage')
          : null;
        
        const audioUrl = audioComp?.storageRef 
          ? buildMediaUrl(API_BASE_URL, recordId, 'audio')
          : null;
        
        setMediaUrls({
          front: frontUrl,
          back: backUrl,
          audio: audioUrl,
        });
        
        setMediaTypes({
          front: !!frontUrl,
          back: !!backUrl,
          audio: !!audioUrl,
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
    } catch (error) {
      console.log('[AdminSosDetail] Fetch error:', error);
      setActionError(error.message || 'Unable to load SOS details.');
    } finally {
      setIsLoading(false);
    }
  };

  // ================= Initial Fetch =================
  useEffect(() => {
    fetchMediaFromBackend();
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
      } catch (error) {
        if (mounted) console.log('[LiveLocation] Refresh error:', error);
      }
    };

    refreshLiveLocation();
    const interval = setInterval(refreshLiveLocation, 5000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [recordId, token]);

  const handleMarkResolved = () => {
    if (actionInFlightRef.current) return;
    Alert.alert('Mark as Resolved', 'Are you sure this emergency has been resolved?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Resolve',
        onPress: async () => {
          if (actionInFlightRef.current) return;
          actionInFlightRef.current = true;
          setActionLoading(true);
          setActionError('');
          const actionRequestId = ++detailRequestRef.current;
          try {
            const response = await deactivateSos(token, record.id || record._id);
            if (actionRequestId === detailRequestRef.current && response?.sos) {
              setDetailRecord(response.sos);
              setLiveLocationStatus(response.sos.liveLocation?.status || null);
              setLiveLocation(response.sos.liveLocation?.lastLocation || null);
            }
            onUpdated?.(response.sos);
          } catch (error) {
            setActionError(error.message || 'Unable to resolve this SOS.');
          } finally {
            actionInFlightRef.current = false;
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
    } finally {
      setActionLoading(false);
    }
  };

  const displayLocation = liveLocation || record.location || null;
  const displayLat = displayLocation?.lat ?? displayLocation?.latitude;
  const displayLng = displayLocation?.lng ?? displayLocation?.longitude;
  const displayAccuracy = displayLocation?.accuracy;
  
  const liveLocationActive = String(liveLocationStatus || record.liveLocation?.status || '').toLowerCase() === 'active';

  const hasFrontImage = !!mediaUrls.front;
  const hasBackImage = !!mediaUrls.back;
  const hasAudio = !!mediaUrls.audio;
  const hasImageData = hasFrontImage || hasBackImage;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" translucent={false} />
      {isLoading ? <View style={styles.topLoading}><ActivityIndicator size="small" color="#E4002B" /><Text style={styles.topLoadingText}>Refreshing latest data...</Text></View> : null}

      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} activeOpacity={0.7} onPress={onBack}>
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
                {record.collectionName || record.collectionId?.name || 'No Group'}
              </Text>
            </View>
          </View>
        </View>
        <View style={[styles.statusBadge, isActive ? styles.statusActive : styles.statusResolved]}>
          <Text style={[styles.statusBadgeText, isActive ? styles.statusActiveText : styles.statusResolvedText]}>
            {record.status || 'Unknown'}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

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

        {/* ================= SERVICE RESULTS ================= */}
        <View style={styles.serviceResultsSection}>
          <Text style={styles.serviceResultsLabel}>SOS SERVICE RESULTS</Text>
          {Object.entries(record.components || record.services || {}).length === 0 ? (
            <Text style={styles.serviceResultEmpty}>No service results recorded.</Text>
          ) : Object.entries(record.components || record.services || {}).map(([name, result]) => (
            <View key={name} style={styles.serviceResultRow}>
              <Text style={styles.serviceResultName}>{name}</Text>
              <Text style={styles.serviceResultStatus}>{String(result?.status || 'unknown').toUpperCase()}</Text>
              {String(result?.status || '').toLowerCase() === 'failed' && result?.error ? (
                <Text style={styles.serviceResultError}>{result.error}</Text>
              ) : null}
            </View>
          ))}
        </View>
        {actionError ? <Text style={styles.serviceResultError}>{actionError}</Text> : null}

        <SosMediaSection
          sosId={recordId}
          token={token}
          sos={record}
          mediaUrls={mediaUrls}
          initialLocation={liveLocation || record?.liveLocation?.lastLocation || record?.location}
          initialStatus={liveLocationStatus || record?.liveLocation?.status}
          showStopButton={liveLocationActive}
          isStopping={actionLoading}
          onStopSharing={handleStopSharing}
          onLocationUpdate={(location, status) => {
            setLiveLocation(location);
            setLiveLocationStatus(status);
          }}
        />

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      </ScrollView>

      {/* ================= FULLSCREEN IMAGE VIEWER ================= */}

      {/* ================= ACTION BUTTONS ================= */}
      <View style={styles.actionContainer}>
        {liveLocationActive && (
          <TouchableOpacity style={styles.stopSharingActionButton} onPress={handleStopSharing} disabled={actionLoading}>
            <Text style={styles.stopSharingActionText}>{actionLoading ? 'Stopping...' : 'Stop Sharing'}</Text>
          </TouchableOpacity>
        )}

        {isActive && !actionLoading ? (
          <TouchableOpacity style={styles.resolveButton} onPress={handleMarkResolved}>
            <Text style={styles.resolveButtonText}>✓ Mark Resolved</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.resolvedButton} onPress={onBack}>
            <Text style={styles.resolvedButtonText}>✓ Resolved</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  topLoading: {height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F2'},
  topLoadingText: {marginLeft: 8, fontSize: 12, color: '#E4002B', fontWeight: '600'},
  safeArea: { flex: 1, backgroundColor: '#F7F7F8' },

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '600',
  },

  // ================= HEADER =================
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

  headerContent: { flex: 1, paddingHorizontal: 10 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center' },

  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  userAvatarText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  headerTitle: { fontSize: 16, fontWeight: '900', color: '#1A1A1A' },
  headerTitleActive: { color: '#E4002B' },
  headerSubtitle: { fontSize: 11, color: '#6E6E73', marginTop: 1, fontWeight: '500' },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, alignSelf: 'flex-start' },
  statusActive: { backgroundColor: '#FDE7EA' },
  statusResolved: { backgroundColor: '#E8F8EF' },
  statusBadgeText: { fontSize: 9, fontWeight: '900' },
  statusActiveText: { color: '#E4002B' },
  statusResolvedText: { color: '#178A4B' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 },

  // ================= MESSAGE CARD =================
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

  messageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  messageLabel: { fontSize: 10, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8 },
  messageTime: { fontSize: 10, color: '#A1A1A6', fontWeight: '500' },
  messageText: { fontSize: 13, color: '#1A1A1A', fontWeight: '500', lineHeight: 20 },

  // ================= SERVICE RESULTS =================
  serviceResultsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginBottom: 16,
  },

  serviceResultsLabel: { fontSize: 12, fontWeight: '900', color: '#374151', letterSpacing: 1, marginBottom: 10 },
  serviceResultRow: { paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#F0F1F3' },
  serviceResultName: { fontSize: 14, fontWeight: '800', color: '#111827' },
  serviceResultStatus: { fontSize: 12, fontWeight: '900', color: '#178A4B', marginTop: 3 },
  serviceResultError: { fontSize: 12, color: '#B42318', marginTop: 3 },
  serviceResultEmpty: { fontSize: 13, color: '#68707D' },

  // ================= PHOTOS =================
  photosSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8, marginBottom: 8 },

  photosGrid: { flexDirection: 'row', gap: 10 },

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

  photoBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },

  photoImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },

  // ================= AUDIO =================
  audioSection: { marginBottom: 16 },

  audioCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 14,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  audioPlayer: { width: '100%' },

  noMediaContainer: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },

  noMediaText: { fontSize: 13, color: '#A1A1A6' },

  errorText: { color: '#B42318', fontSize: 13, textAlign: 'center', marginTop: 10 },

  // ================= ERROR =================
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText2: { fontSize: 16, color: '#B42318', fontWeight: '700', marginBottom: 16 },
  errorBackButton: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E4002B' },
  errorBackText: { color: '#FFFFFF', fontWeight: '700' },

  // ================= ACTION BUTTONS =================
  actionContainer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EDEDEF',
  },

  stopSharingActionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#FFF5F6',
    borderWidth: 1,
    borderColor: '#F3B5BF',
    alignItems: 'center',
  },

  stopSharingActionText: { fontSize: 13, fontWeight: '700', color: '#D9263A' },

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

  resolveButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  resolvedButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 28,
    backgroundColor: '#178A4B',
    alignItems: 'center',
  },

  resolvedButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});

export default AdminSosDetailScreen;