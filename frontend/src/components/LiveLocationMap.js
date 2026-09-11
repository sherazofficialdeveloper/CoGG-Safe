// LiveLocationMap.js - React Native Maps Version
import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  Linking,
} from 'react-native';
import MapView, {Marker, Circle, PROVIDER_GOOGLE} from 'react-native-maps';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {getLiveLocation} from '../api/resources';

const {width: screenWidth} = Dimensions.get('window');

const LiveLocationMap = ({
  sosId,
  token,
  initialLocation = null,
  initialStatus = null,
  onLocationUpdate = null,
  showStopButton = false,
  onStopSharing = null,
  isStopping = false,
  style = {},
}) => {
  const [liveLocation, setLiveLocation] = useState(initialLocation || null);
  const [liveLocationStatus, setLiveLocationStatus] = useState(initialStatus || null);
  const [locationUpdateTime, setLocationUpdateTime] = useState('Just now');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationHistory, setLocationHistory] = useState([]);
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [region, setRegion] = useState(null);
  const intervalRef = useRef(null);
  const mapRef = useRef(null);

  const liveActive = String(liveLocationStatus || '').toLowerCase() === 'active';

  const latestLocation = liveLocation || initialLocation || null;
  const displayLat = latestLocation?.lat ?? latestLocation?.latitude ?? null;
  const displayLng = latestLocation?.lng ?? latestLocation?.longitude ?? null;
  const displayAccuracy = latestLocation?.accuracy ?? null;

  const hasLocation =
    displayLat !== null &&
    displayLng !== null &&
    !isNaN(displayLat) &&
    !isNaN(displayLng) &&
    Math.abs(displayLat) <= 90 &&
    Math.abs(displayLng) <= 180;

  // ================= Fetch Live Location =================
  const fetchLiveLocation = async (forceRefresh = false) => {
    if (!token || !sosId) {
      setLoading(false);
      return;
    }

    try {
      const result = await getLiveLocation(token, sosId, {limit: 20}, {forceRefresh});
      if (result?.liveLocation) {
        const status = result.liveLocation.status || null;
        setLiveLocationStatus(status);

        const latest = result.liveLocation.lastLocation || result.pings?.[0] || null;
        if (latest) {
          setLiveLocation(latest);
          setLocationUpdateTime(
            latest.capturedAt
              ? new Date(latest.capturedAt).toLocaleString()
              : 'Just now',
          );

          // Animate map to new location
          const newLat = latest.latitude;
          const newLng = latest.longitude;
          if (
            newLat != null &&
            newLng != null &&
            mapRef.current &&
            mapRef.current.animateToRegion
          ) {
            mapRef.current.animateToRegion(
              {
                latitude: newLat,
                longitude: newLng,
                latitudeDelta: 0.005,
                longitudeDelta: 0.005,
              },
              800,
            );
          }

          if (onLocationUpdate) {
            onLocationUpdate(latest, status);
          }
        }

        if (result.pings && result.pings.length > 0) {
          setLocationHistory(result.pings);
        }
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Unable to fetch location');
    } finally {
      setLoading(false);
    }
  };

  // ================= Initial Fetch =================
  useEffect(() => {
    fetchLiveLocation(true);
  }, [sosId, token]);

  // ================= Set initial region =================
  useEffect(() => {
    if (hasLocation && !region) {
      setRegion({
        latitude: Number(displayLat),
        longitude: Number(displayLng),
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
    }
  }, [displayLat, displayLng]);

  // ================= Polling =================
  useEffect(() => {
    if (!sosId || !token) return undefined;

    intervalRef.current = setInterval(() => {
      fetchLiveLocation(true);
    }, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sosId, token]);

  // ================= Get Speed =================
  const getSpeedDisplay = () => {
    if (currentSpeed > 0) {
      return `${Math.round(currentSpeed * 3.6)} km/h`;
    }
    return 'Stationary';
  };

  // ================= Open in Google Maps =================
  const openInGoogleMaps = () => {
    if (!hasLocation) return;
    const url = Platform.select({
      ios: `maps:0,0?q=${displayLat},${displayLng}`,
      android: `geo:${displayLat},${displayLng}?q=${displayLat},${displayLng}(Emergency Location)`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(
        `https://www.google.com/maps/search/?api=1&query=${displayLat},${displayLng}`,
      );
    });
  };

  // ================= Loading State =================
  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E4002B" />
          <Text style={styles.loadingText}>Loading live location...</Text>
        </View>
      </View>
    );
  }

  // ================= No Location State =================
  if (!hasLocation) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.locationUnavailable}>
          <Text style={styles.locationUnavailableIcon}>📍</Text>
          <Text style={styles.locationUnavailableTitle}>Location not available</Text>
          <Text style={styles.locationUnavailableText}>
            {error || 'Waiting for GPS signal...'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchLiveLocation(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ================= Map View =================
  return (
    <View style={[styles.container, style]}>
      {/* ================= STATUS BAR ================= */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusIcon}>📍</Text>
          <View>
            <Text
              style={[
                styles.statusText,
                {color: liveActive ? '#22C55E' : '#6B7280'},
              ]}>
              {liveActive ? '🟢 Live Tracking Active' : '📌 Location Fixed'}
            </Text>
            <Text style={styles.statusSubText}>
              {liveActive ? `Updated: ${locationUpdateTime}` : 'Tracking ended'}
            </Text>
          </View>
        </View>
        <View style={styles.statusRight}>
          <Text style={styles.statusSpeed}>{getSpeedDisplay()}</Text>
        </View>
      </View>

      {/* ================= MAP ================= */}
      <View style={styles.mapWrapper}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={
            region || {
              latitude: Number(displayLat),
              longitude: Number(displayLng),
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            }
          }
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={true}
          showsScale={true}
          rotateEnabled={true}
          zoomEnabled={true}
          scrollEnabled={true}
          pitchEnabled={true}
          toolbarEnabled={false}
          loadingEnabled={true}
          loadingIndicatorColor="#E4002B"
          loadingBackgroundColor="#F9FAFB">
          {/* ================= ACCURACY CIRCLE ================= */}
          {displayAccuracy != null && (
            <Circle
              center={{
                latitude: Number(displayLat),
                longitude: Number(displayLng),
              }}
              radius={Number(displayAccuracy) || 50}
              strokeColor="rgba(26, 115, 232, 0.3)"
              fillColor="rgba(26, 115, 232, 0.08)"
              strokeWidth={2}
            />
          )}

          {/* ================= MARKER ================= */}
          <Marker
            coordinate={{
              latitude: Number(displayLat),
              longitude: Number(displayLng),
            }}
            title="Emergency Location"
            description={`Updated: ${locationUpdateTime}`}
            pinColor="#1A73E8"
          />
        </MapView>

        {/* ================= MAP OVERLAY ================= */}
        <View style={styles.mapOverlay}>
          <View style={styles.mapOverlayTop}>
            <View style={styles.mapOverlayIconContainer}>
              <Text style={styles.mapOverlayIcon}>📍</Text>
            </View>
            <View style={styles.mapOverlayContent}>
              <Text style={styles.mapOverlayTitle}>
                {liveActive ? '🟢 Live GPS Location' : '📍 Last Known Location'}
              </Text>
              <Text style={styles.mapOverlayCoords}>
                {Number(displayLat).toFixed(6)}, {Number(displayLng).toFixed(6)}
              </Text>
            </View>
          </View>
          <View style={styles.mapOverlayBottom}>
            <Text style={styles.mapOverlayAccuracy}>
              {displayAccuracy !== null
                ? `±${Number(displayAccuracy).toFixed(1)}m accuracy`
                : 'Accuracy: Unknown'}
            </Text>
            <Text style={styles.mapOverlayTime}>🕐 {locationUpdateTime}</Text>
          </View>
        </View>

        {/* ================= TAP HINT ================= */}
        <TouchableOpacity
          style={styles.tapHint}
          onPress={openInGoogleMaps}
          activeOpacity={0.8}>
          <Text style={styles.tapHintText}>👆 Tap to open in Google Maps</Text>
        </TouchableOpacity>
      </View>

      {/* ================= LOCATION STATS ================= */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{locationHistory.length || 0}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {displayAccuracy !== null
              ? `${Number(displayAccuracy).toFixed(0)}m`
              : '—'}
          </Text>
          <Text style={styles.statLabel}>Accuracy</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{liveActive ? '🟢' : '🔴'}</Text>
          <Text style={styles.statLabel}>Status</Text>
        </View>
      </View>

      {/* ================= STOP SHARING BUTTON ================= */}
      {showStopButton && liveActive && (
        <TouchableOpacity
          style={styles.stopButton}
          onPress={onStopSharing}
          disabled={isStopping}>
          <Icon name="stop-circle" size={20} color="#D9263A" />
          <Text style={styles.stopButtonText}>
            {isStopping ? 'Stopping...' : 'Stop Sharing Live Location'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 12,
  },

  // ================= STATUS BAR =================
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    marginBottom: 10,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '800',
  },
  statusSubText: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 1,
  },
  statusRight: {
    alignItems: 'flex-end',
  },
  statusSpeed: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1A1A1A',
  },

  loadingContainer: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDEDEF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#6E6E73',
    fontWeight: '600',
  },

  // ================= MAP =================
  mapWrapper: {
    width: '100%',
    height: 280,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  map: {
    width: '100%',
    height: '100%',
  },

  // ================= OVERLAY =================
  mapOverlay: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mapOverlayTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  mapOverlayIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EAF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mapOverlayIcon: {
    fontSize: 16,
  },
  mapOverlayContent: {
    flex: 1,
  },
  mapOverlayTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1A73E8',
  },
  mapOverlayCoords: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 1,
  },
  mapOverlayBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  mapOverlayAccuracy: {
    fontSize: 10,
    color: '#6E6E73',
  },
  mapOverlayTime: {
    fontSize: 10,
    color: '#6E6E73',
  },

  // ================= TAP HINT =================
  tapHint: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tapHintText: {
    fontSize: 9,
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ================= STATS =================
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 9,
    color: '#9CA3AF',
    fontWeight: '600',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E8E8EB',
  },

  // ================= STOP BUTTON =================
  stopButton: {
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#F3B5BF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 10,
  },
  stopButtonText: {
    color: '#D9263A',
    fontSize: 14,
    fontWeight: '800',
    marginLeft: 8,
  },

  // ================= UNAVAILABLE =================
  locationUnavailable: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EDEDEF',
  },
  locationUnavailableIcon: {
    fontSize: 36,
    marginBottom: 10,
  },
  locationUnavailableTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  locationUnavailableText: {
    fontSize: 13,
    color: '#A1A1A6',
    marginTop: 4,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E4002B',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default LiveLocationMap;