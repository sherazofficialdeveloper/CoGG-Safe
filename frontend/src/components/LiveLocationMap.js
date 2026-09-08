// LiveLocationMap.js - WebView Version (No compilation issues)
import React, {useEffect, useState, useRef} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import {WebView} from 'react-native-webview';
import Icon from './Icon';
import {API_BASE_URL} from '../api/config';
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
  const intervalRef = useRef(null);
  const webViewRef = useRef(null);

  const liveActive = String(liveLocationStatus || '').toLowerCase() === 'active';

  const latestLocation = liveLocation || initialLocation || null;
  const displayLat = latestLocation?.lat ?? latestLocation?.latitude ?? null;
  const displayLng = latestLocation?.lng ?? latestLocation?.longitude ?? null;
  const displayAccuracy = latestLocation?.accuracy ?? null;

  const hasLocation = displayLat !== null && displayLng !== null
    && !isNaN(displayLat) && !isNaN(displayLng)
    && Math.abs(displayLat) <= 90 && Math.abs(displayLng) <= 180;

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
            latest.capturedAt ? new Date(latest.capturedAt).toLocaleString() : 'Just now'
          );
          
          // Send new location to WebView
          if (webViewRef.current && latest.latitude != null && latest.longitude != null) {
            const locationData = {
              lat: latest.latitude,
              lng: latest.longitude,
              accuracy: latest.accuracy || null,
              time: latest.capturedAt || new Date().toISOString(),
            };
            webViewRef.current.injectJavaScript(`
              updateLocation(${JSON.stringify(locationData)});
              true;
            `);
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

  // ================= Open Location =================
  const handleOpenLocation = () => {
    if (!hasLocation) return;
    Linking.openURL(`https://www.google.com/maps?q=${displayLat},${displayLng}`);
  };

  // ================= Get Speed =================
  const getSpeedDisplay = () => {
    if (currentSpeed > 0) {
      return `${Math.round(currentSpeed * 3.6)} km/h`;
    }
    return 'Stationary';
  };

  // ================= HTML for WebView (OpenStreetMap) =================
  const getMapHtml = () => {
    const lat = displayLat || 0;
    const lng = displayLng || 0;
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { margin: 0; padding: 0; }
          body { 
            width: 100%; 
            height: 100%; 
            overflow: hidden;
            background: #E8EDF3;
          }
          #map { 
            width: 100%; 
            height: 100%; 
            position: relative;
          }
          .marker-pulse {
            width: 20px;
            height: 20px;
            background: #E4002B;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 20px rgba(228, 0, 43, 0.6);
            animation: pulse 1.5s ease-in-out infinite;
          }
          @keyframes pulse {
            0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(228, 0, 43, 0.6); }
            50% { transform: scale(1.3); box-shadow: 0 0 0 20px rgba(228, 0, 43, 0); }
            100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(228, 0, 43, 0); }
          }
          .accuracy-circle {
            position: absolute;
            border-radius: 50%;
            border: 2px solid rgba(228, 0, 43, 0.3);
            background: rgba(228, 0, 43, 0.05);
            pointer-events: none;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false,
            attributionControl: false,
            center: [${lat}, ${lng}],
            zoom: 16
          });

          // ================= TILE LAYER =================
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap'
          }).addTo(map);

          // ================= ZOOM CONTROLS =================
          L.control.zoom({
            position: 'topright'
          }).addTo(map);

          // ================= ACCURACY CIRCLE =================
          var accuracyCircle = L.circle([${lat}, ${lng}], {
            radius: ${displayAccuracy || 50},
            color: 'rgba(228, 0, 43, 0.3)',
            fillColor: 'rgba(228, 0, 43, 0.08)',
            fillOpacity: 1,
            weight: 1
          }).addTo(map);

          // ================= CUSTOM MARKER =================
          var customIcon = L.divIcon({
            html: '<div class="marker-pulse"></div>',
            className: 'custom-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });

          var marker = L.marker([${lat}, ${lng}], {
            icon: customIcon,
            title: 'Emergency Location'
          }).addTo(map);

          // ================= UPDATE LOCATION =================
          function updateLocation(data) {
            if (!data) return;
            
            var newLat = data.lat ?? data.latitude;
            var newLng = data.lng ?? data.longitude;
            
            if (newLat == null || newLng == null) return;
            
            // Update marker position
            marker.setLatLng([newLat, newLng]);
            
            // Update accuracy circle
            var radius = data.accuracy || 50;
            accuracyCircle.setLatLng([newLat, newLng]);
            accuracyCircle.setRadius(radius);
            
            // Smooth pan to new location
            map.panTo([newLat, newLng], {
              duration: 0.5,
              animate: true
            });
          }

          // ================= WINDOW RESIZE =================
          window.addEventListener('resize', function() {
            map.invalidateSize();
          });
        </script>
      </body>
      </html>
    `;
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
          <TouchableOpacity style={styles.retryButton} onPress={() => fetchLiveLocation(true)}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ================= WebView Map =================
  return (
    <View style={[styles.container, style]}>
      
      {/* ================= STATUS BAR ================= */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <Text style={styles.statusIcon}>📍</Text>
          <View>
            <Text style={[styles.statusText, {color: liveActive ? '#22C55E' : '#6B7280'}]}>
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

      {/* ================= MAP - WebView ================= */}
      <TouchableOpacity
        style={styles.mapWrapper}
        activeOpacity={0.95}
        onPress={handleOpenLocation}
      >
        <WebView
          ref={webViewRef}
          source={{html: getMapHtml()}}
          style={styles.map}
          onLoadEnd={() => {
            const latest = liveLocation || initialLocation;
            const lat = latest?.lat ?? latest?.latitude;
            const lng = latest?.lng ?? latest?.longitude;
            if (lat != null && lng != null && webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                updateLocation(${JSON.stringify({
                  lat,
                  lng,
                  accuracy: latest?.accuracy ?? null,
                  time: latest?.capturedAt || new Date().toISOString(),
                })});
                true;
              `);
            }
          }}
          onLoadEnd={() => {
            const latest = liveLocation || initialLocation;
            const lat = latest?.lat ?? latest?.latitude;
            const lng = latest?.lng ?? latest?.longitude;
            if (lat != null && lng != null && webViewRef.current) {
              webViewRef.current.injectJavaScript(`
                updateLocation(${JSON.stringify({
                  lat,
                  lng,
                  accuracy: latest?.accuracy ?? null,
                  time: latest?.capturedAt || new Date().toISOString(),
                })});
                true;
              `);
            }
          }}
          scrollEnabled={false}
          zoomEnabled={false}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          renderLoading={() => (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color="#E4002B" />
            </View>
          )}
          renderError={() => (
            <View style={styles.mapError}>
              <Text style={styles.mapErrorText}>⚠️ Failed to load map</Text>
              <TouchableOpacity onPress={() => fetchLiveLocation(true)}>
                <Text style={styles.mapErrorRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        />

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
              {displayAccuracy !== null ? `±${displayAccuracy.toFixed(1)}m accuracy` : 'Accuracy: Unknown'}
            </Text>
            <Text style={styles.mapOverlayTime}>
              🕐 {locationUpdateTime}
            </Text>
          </View>
        </View>

        {/* ================= TAP HINT ================= */}
        <View style={styles.tapHint}>
          <Text style={styles.tapHintText}>👆 Tap to open in Google Maps</Text>
        </View>
      </TouchableOpacity>

      {/* ================= LOCATION STATS ================= */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{locationHistory.length || 0}</Text>
          <Text style={styles.statLabel}>Points</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {displayAccuracy !== null ? `${displayAccuracy.toFixed(0)}m` : '—'}
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
        <TouchableOpacity style={styles.stopButton} onPress={onStopSharing} disabled={isStopping}>
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
    height: 260,
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
    backgroundColor: '#E8EDF3',
  },

  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EDF3',
  },

  mapError: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    padding: 20,
  },

  mapErrorText: {
    fontSize: 14,
    color: '#B42318',
    fontWeight: '600',
    marginBottom: 12,
  },

  mapErrorRetry: {
    color: '#E4002B',
    fontSize: 14,
    fontWeight: '800',
  },

  // ================= OVERLAY =================
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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },

  stopButtonText: {
    color: '#D9263A',
    fontSize: 14,
    fontWeight: '800',
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