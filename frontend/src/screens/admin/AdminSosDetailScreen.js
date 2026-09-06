// AdminSosDetailScreen.js - COMPLETE FIXED with Audio + Live Location Map
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
import AudioPlayer from '../../components/AudioPlayer';
import FullscreenImageViewer from '../../components/FullscreenImageViewer';
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
          ? `${API_BASE_URL}/sos/${recordId}/media/frontImage/file`
          : null;
        
        const backUrl = backComp?.storageRef 
          ? `${API_BASE_URL}/sos/${recordId}/media/backImage/file`
          : null;
        
        const audioUrl = audioComp?.storageRef 
          ? `${API_BASE_URL}/sos/${recordId}/media/audio/file`
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

  const handleOpenLocation = () => {
    const loc = liveLocation || record.location;
    if (loc?.latitude == null && loc?.lat == null) return;
    const latitude = loc.lat ?? loc.latitude;
    const longitude = loc.lng ?? loc.longitude;
    const url = `https://www.google.com/maps?q=${latitude},${longitude}`;
    Linking.openURL(url);
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

  if (isLoading) {
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
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" translucent={false} />

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
                {record.collectionName || record.collectionId?.name || 'No Collection'}
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

        {/* ================= LIVE LOCATION - MAP STYLE ================= */}
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

          {displayLat != null && displayLng != null ? (
            <TouchableOpacity 
              style={styles.mapContainer} 
              activeOpacity={0.9} 
              onPress={handleOpenLocation}
            >
              {/* Map Grid Background */}
              <View style={styles.mapGrid}>
                {/* Street lines */}
                <View style={[styles.mapStreet, styles.mapStreet1]} />
                <View style={[styles.mapStreet, styles.mapStreet2]} />
                <View style={[styles.mapStreet, styles.mapStreet3]} />
                <View style={[styles.mapStreet, styles.mapStreet4]} />
                
                {/* Building blocks */}
                <View style={[styles.mapBuilding, styles.mapBuilding1]} />
                <View style={[styles.mapBuilding, styles.mapBuilding2]} />
                <View style={[styles.mapBuilding, styles.mapBuilding3]} />
                <View style={[styles.mapBuilding, styles.mapBuilding4]} />
                
                {/* Location Marker with Pulse Animation */}
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

              {/* Location Info Overlay */}
              <View style={styles.mapOverlay}>
                <View style={styles.mapOverlayTop}>
                  <View style={styles.mapOverlayIconContainer}>
                    <Text style={styles.mapOverlayIcon}>📍</Text>
                  </View>
                  <View style={styles.mapOverlayContent}>
                    <Text style={styles.mapOverlayTitle}>
                      {liveLocationActive ? 'Live GPS Location' : 'Last Known Location'}
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

              {/* Tap to open hint */}
              <View style={styles.mapTapHint}>
                <Text style={styles.mapTapHintText}>Tap to open in Google Maps</Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.locationUnavailable}>
              <Text style={styles.locationUnavailableIcon}>📍</Text>
              <Text style={styles.locationUnavailableTitle}>Location not available</Text>
              <Text style={styles.locationUnavailableText}>Waiting for GPS signal...</Text>
            </View>
          )}

          {/* Initial SOS Location */}
          {record.location?.latitude != null && record.location?.longitude != null && (
            <View style={styles.initialLocationContainer}>
              <Text style={styles.initialLocationLabel}>📍 Initial SOS Location</Text>
              <Text style={styles.initialLocationCoords}>
                {Number(record.location.latitude).toFixed(5)}, {Number(record.location.longitude).toFixed(5)}
              </Text>
            </View>
          )}

          {/* Stop Sharing Button */}
          {liveLocationActive && (
            <TouchableOpacity style={styles.stopSharingButton} onPress={handleStopSharing} disabled={actionLoading}>
              <Text style={styles.stopSharingText}>{actionLoading ? 'Stopping...' : 'Stop Sharing Live Location'}</Text>
            </TouchableOpacity>
          )}

          {/* Emergency Link */}
          {record.emergencyLink && (
            <TouchableOpacity style={styles.emergencyLinkCard} onPress={() => Linking.openURL(record.emergencyLink)}>
              <Text style={styles.emergencyLinkLabel}>🔗 EMERGENCY TRACKING LINK</Text>
              <Text style={styles.emergencyLinkText}>{record.emergencyLink}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ================= PHOTOS SECTION ================= */}
        <View style={styles.photosSection}>
          <Text style={styles.sectionLabel}>📷 CAMERA PHOTOS</Text>
          
          {hasImageData ? (
            <View style={styles.photosGrid}>
              {hasFrontImage && !hiddenImages.front && (
                <View style={styles.photoBox}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Front</Text></View>
                  <TouchableOpacity onPress={() => setSelectedImage(mediaUrls.front)} activeOpacity={0.85}>
                    <Image
                      source={{ uri: mediaUrls.front, headers: authHeaders }}
                      style={styles.photoImage}
                      onError={() => setHiddenImages(prev => ({...prev, front: true}))}
                    />
                  </TouchableOpacity>
                </View>
              )}
              
              {hasBackImage && !hiddenImages.back && (
                <View style={styles.photoBox}>
                  <View style={styles.photoBadge}><Text style={styles.photoBadgeText}>Back</Text></View>
                  <TouchableOpacity onPress={() => setSelectedImage(mediaUrls.back)} activeOpacity={0.85}>
                    <Image
                      source={{ uri: mediaUrls.back, headers: authHeaders }}
                      style={styles.photoImage}
                      onError={() => setHiddenImages(prev => ({...prev, back: true}))}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.noMediaContainer}>
              <Text style={styles.noMediaText}>No photos available for this SOS.</Text>
            </View>
          )}
        </View>

       <View style={styles.audioSection}>
  <Text style={styles.sectionLabel}>🎙️ VOICE RECORDING</Text>
  
  {hasAudio ? (
    <View style={styles.audioCard}>
      <AudioPlayer
        audioUrl={mediaUrls.audio}
        token={token}
        publicMedia={false}
        directFetch={true}  // ================= NEW: Direct fetch mode =================
        style={styles.audioPlayer}
        onError={(error) => {
          console.log('[AdminAudio Error]', error);
          setAudioError(error?.message || 'Audio playback failed');
        }}
      />
    </View>
  ) : (
    <View style={styles.noMediaContainer}>
      <Text style={styles.noMediaText}>No audio recording available.</Text>
    </View>
  )}
</View>

        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

      </ScrollView>

      {/* ================= FULLSCREEN IMAGE VIEWER ================= */}
      <FullscreenImageViewer
        visible={Boolean(selectedImage)}
        uri={selectedImage}
        headers={authHeaders}
        onClose={() => setSelectedImage(null)}
      />

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

  // ================= LOCATION SECTION - MAP STYLE =================
  locationSection: { marginBottom: 16 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  locationLabel: { fontSize: 12, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.8 },

  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDE7EA', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4002B', marginRight: 5 },
  liveText: { fontSize: 8, fontWeight: '900', color: '#E4002B', letterSpacing: 0.5 },

  // Map Container
  mapContainer: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8EDF3',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },

  mapGrid: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },

  // Street lines
  mapStreet: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  mapStreet1: {
    top: '25%',
    left: '-10%',
    right: '-10%',
    height: 3,
    transform: [{rotate: '-3deg'}],
  },

  mapStreet2: {
    top: '55%',
    left: '-10%',
    right: '-10%',
    height: 3,
    transform: [{rotate: '2deg'}],
  },

  mapStreet3: {
    top: '-10%',
    bottom: '-10%',
    left: '30%',
    width: 3,
    transform: [{rotate: '5deg'}],
  },

  mapStreet4: {
    top: '-10%',
    bottom: '-10%',
    right: '25%',
    width: 3,
    transform: [{rotate: '-4deg'}],
  },

  // Building blocks
  mapBuilding: {
    position: 'absolute',
    backgroundColor: 'rgba(160,180,200,0.25)',
    borderRadius: 2,
  },

  mapBuilding1: { top: '10%', left: '15%', width: '18%', height: '12%' },
  mapBuilding2: { top: '8%', right: '20%', width: '14%', height: '10%' },
  mapBuilding3: { bottom: '15%', left: '20%', width: '20%', height: '14%' },
  mapBuilding4: { bottom: '12%', right: '15%', width: '16%', height: '12%' },

  // Marker with Pulse
  markerContainer: {
    position: 'absolute',
    top: '45%',
    left: '47%',
    alignItems: 'center',
    justifyContent: 'center',
  },

  pulseRing1: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(228, 0, 43, 0.15)',
    top: -22,
    left: -22,
  },

  pulseRing2: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'rgba(228, 0, 43, 0.25)',
    top: -12,
    left: -12,
  },

  markerOuter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(228, 0, 43, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  markerInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(228, 0, 43, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  markerDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E4002B',
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 0},
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },

  // Map Overlay
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },

  mapOverlayTop: { flexDirection: 'row', alignItems: 'center' },
  mapOverlayIconContainer: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EAF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  mapOverlayIcon: { fontSize: 16 },
  mapOverlayContent: { flex: 1 },
  mapOverlayTitle: { fontSize: 11, fontWeight: '900', color: '#1A73E8' },
  mapOverlayCoords: { fontSize: 12, fontWeight: '700', color: '#1A1A1A', marginTop: 1 },

  mapOverlayBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  mapOverlayAccuracy: { fontSize: 10, color: '#6E6E73' },
  mapOverlayTime: { fontSize: 10, color: '#6E6E73' },

  mapTapHint: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },

  mapTapHintText: { fontSize: 9, color: '#FFFFFF', fontWeight: '600' },

  // Location Unavailable
  locationUnavailable: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
  },

  locationUnavailableIcon: { fontSize: 32, marginBottom: 10 },
  locationUnavailableTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  locationUnavailableText: { fontSize: 13, color: '#A1A1A6', marginTop: 4 },

  // Initial Location
  initialLocationContainer: {
    backgroundColor: '#F5F6F8',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },

  initialLocationLabel: { fontSize: 10, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.5 },
  initialLocationCoords: { fontSize: 12, fontWeight: '600', color: '#1A1A1A', marginTop: 2 },

  // Stop Sharing
  stopSharingButton: {
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#F3B5BF',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },

  stopSharingText: { color: '#D9263A', fontSize: 14, fontWeight: '800' },

  // Emergency Link
  emergencyLinkCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },

  emergencyLinkLabel: { fontSize: 10, fontWeight: '900', color: '#6E6E73', letterSpacing: 0.5 },
  emergencyLinkText: { color: '#E4002B', fontSize: 12, fontWeight: '700', marginTop: 4 },

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