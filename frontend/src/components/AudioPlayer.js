// AudioPlayer.js - COMPLETE FIX (No backend modification)
import React, {useEffect, useState, useRef} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

let Sound = null;
if (typeof jest === 'undefined') {
  try {
    Sound = require('react-native-sound');
  } catch (error) {
    Sound = null;
  }
}

const AudioPlayer = ({
  audioUrl,
  localPath = null,
  token,
  publicMedia = false,
  directFetch = true,
  onError = null,
  style = {},
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sound, setSound] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const soundRef = useRef(null);
  const isMountedRef = useRef(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (soundRef.current) {
        try {
          soundRef.current.release();
          soundRef.current = null;
        } catch (_) {}
      }
    };
  }, []);

  // ================= MAIN: Initialize Audio =================
  useEffect(() => {
    const hasUrl = audioUrl && typeof audioUrl === 'string' && audioUrl.trim().length > 0;
    const hasLocalPath = localPath && typeof localPath === 'string' && localPath.trim().length > 0;

    console.log('[AudioPlayer] Init:', { hasUrl, hasLocalPath, publicMedia, directFetch });

    if (!hasUrl && !hasLocalPath) {
      setError('No audio source');
      setIsLoading(false);
      return;
    }

    if (!Sound) {
      setError('Audio playback unavailable');
      setIsLoading(false);
      return;
    }

    let loadedSound = null;
    let isCancelled = false;

    const loadAudio = async () => {
      try {
        let playablePath = localPath;

        if (!playablePath && hasUrl) {
          let trimmedUrl = audioUrl.trim();

          // ================= FIX 1: PUBLIC MEDIA =================
          if (publicMedia) {
            playablePath = trimmedUrl;
            console.log('[AudioPlayer] Public media URL (using directly)');
          }
          // ================= FIX 2: PRIVATE MEDIA - Add token as query param =================
          else if (token && token.trim().length > 0) {
            // ================= Backend already supports ?token= query param =================
            // Check sos.controller.js - getMediaFile has: if (!authToken && req.query.token)
            const separator = trimmedUrl.includes('?') ? '&' : '?';
            playablePath = `${trimmedUrl}${separator}token=${encodeURIComponent(token)}`;
            console.log('[AudioPlayer] Private media URL with token param:', playablePath);
          }
          // ================= FIX 3: NO TOKEN =================
          else {
            console.log('[AudioPlayer] No token, using URL directly');
            playablePath = trimmedUrl;
          }
        }

        if (!playablePath) {
          setError('No playable audio');
          setIsLoading(false);
          return;
        }

        if (!isMountedRef.current || isCancelled) return;

        // ================= Prepare path for Sound =================
        let soundPath = playablePath;
        
        // If it's a remote URL (http/https), use as-is
        if (soundPath.startsWith('http://') || soundPath.startsWith('https://')) {
          console.log('[AudioPlayer] Remote URL, using directly');
        }
        // If it's a local path without file:// prefix, add it
        else if (!soundPath.startsWith('file://') && !soundPath.startsWith('/')) {
          soundPath = Platform.OS === 'android' ? `file://${soundPath}` : soundPath;
        }

        console.log('[AudioPlayer] Final path for Sound:', soundPath);

        loadedSound = new Sound(soundPath, '', (loadError) => {
          if (!isMountedRef.current || isCancelled) return;

          if (loadError) {
            console.log('[AudioPlayer] Load error:', loadError);
            
            // ================= Retry without file:// =================
            if (soundPath.startsWith('file://')) {
              const fallbackPath = soundPath.replace('file://', '');
              console.log('[AudioPlayer] Retry without file://:', fallbackPath);
              const retrySound = new Sound(fallbackPath, '', (retryError) => {
                if (!isMountedRef.current || isCancelled) return;
                if (retryError) {
                  console.log('[AudioPlayer] Retry failed:', retryError);
                  setError('Could not load audio');
                  setIsLoading(false);
                  if (onError) onError(retryError);
                } else {
                  console.log('[AudioPlayer] Retry success!');
                  setSound(retrySound);
                  soundRef.current = retrySound;
                  setDuration(retrySound.getDuration() || 0);
                  setIsLoading(false);
                }
              });
              return;
            }

            setError('Could not load audio');
            setIsLoading(false);
            if (onError) onError(loadError);
            return;
          }

          console.log('[AudioPlayer] Sound loaded! Duration:', loadedSound.getDuration());
          setSound(loadedSound);
          soundRef.current = loadedSound;
          setDuration(loadedSound.getDuration() || 0);
          setIsLoading(false);
        });
      } catch (err) {
        console.log('[AudioPlayer] Init error:', err);
        setError('Audio unavailable');
        setIsLoading(false);
        if (onError) onError(err);
      }
    };

    loadAudio();

    return () => {
      isCancelled = true;
      if (loadedSound) {
        try { loadedSound.release(); } catch (_) {}
      }
    };
  }, [audioUrl, localPath, token, publicMedia, directFetch, reloadKey]);

  // ================= Play/Pause =================
  const handlePlayPause = () => {
    if (!soundRef.current) {
      setError('Audio not available');
      return;
    }

    try {
      if (isPlaying) {
        soundRef.current.pause();
        setIsPlaying(false);
        return;
      }

      soundRef.current.play((success) => {
        setIsPlaying(false);
        if (success) {
          setCurrentTime(0);
          if (soundRef.current) soundRef.current.setCurrentTime(0);
        }
      });
      setIsPlaying(true);
    } catch (err) {
      setError('Could not play');
      if (onError) onError(err);
    }
  };

  // ================= Stop =================
  const handleStop = () => {
    if (!soundRef.current) return;
    try {
      soundRef.current.stop();
      soundRef.current.setCurrentTime(0);
      setIsPlaying(false);
      setCurrentTime(0);
    } catch (_) {}
  };

  // ================= Update Time =================
  useEffect(() => {
    if (!isPlaying || !soundRef.current) return;
    const interval = setInterval(() => {
      if (soundRef.current) {
        soundRef.current.getCurrentTime((secs) => setCurrentTime(secs || 0));
      }
    }, 250);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // ================= Format Time =================
  const formatTime = (secs) => {
    const s = Number.isFinite(secs) ? Math.max(0, secs) : 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // ================= Retry =================
  const handleRetry = () => {
    console.log('[AudioPlayer] Retry clicked');
    if (soundRef.current) {
      try {
        soundRef.current.release();
      } catch (_) {}
      soundRef.current = null;
    }
    setSound(null);
    setError(null);
    setIsLoading(true);
    setCurrentTime(0);
    setDuration(0);
    setReloadKey(prev => prev + 1);
  };

  // ================= Error State =================
  if (error) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ================= Loading State =================
  if (isLoading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#E4002B" />
          <Text style={styles.loadingText}>Loading audio...</Text>
        </View>
      </View>
    );
  }

  const hasSound = !!soundRef.current;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.playerBox, !hasSound && styles.playerBoxDisabled]}>
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={handlePlayPause}
            style={[styles.playButton, !hasSound && styles.playButtonDisabled]}
            disabled={!hasSound}
            activeOpacity={0.7}
          >
            <Icon name={isPlaying ? 'pause' : 'play'} size={32} color={hasSound ? '#FFFFFF' : '#999999'} />
          </TouchableOpacity>

          <View style={styles.timeInfo}>
            <Text style={styles.timeText}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>

          {isPlaying && hasSound && (
            <TouchableOpacity onPress={handleStop} style={styles.stopButton} activeOpacity={0.7}>
              <Icon name="stop" size={24} color="#FF6B6B" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }]} />
          </View>
        </View>

        {!hasSound && <Text style={styles.noSoundText}>Audio not available</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', paddingVertical: 8, paddingHorizontal: 4 },
  playerBox: { backgroundColor: '#F5F6F8', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  playerBoxDisabled: { opacity: 0.6 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  playButton: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#E4002B', alignItems: 'center', justifyContent: 'center', shadowColor: '#E4002B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  playButtonDisabled: { backgroundColor: '#D1D5DB', shadowOpacity: 0, elevation: 0 },
  timeInfo: { flex: 1, alignItems: 'center', paddingHorizontal: 12 },
  timeText: { fontSize: 14, color: '#4B5563', fontWeight: '600' },
  stopButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF5F6', borderWidth: 1, borderColor: '#F3B5BF', alignItems: 'center', justifyContent: 'center' },
  progressContainer: { marginTop: 12, width: '100%' },
  progressBar: { height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#E4002B', borderRadius: 2 },
  noSoundText: { textAlign: 'center', fontSize: 12, color: '#9CA3AF', marginTop: 8 },
  loadingBox: { padding: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F8', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280', fontWeight: '600' },
  errorBox: { padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, borderWidth: 1, borderColor: '#FECACA' },
  errorIcon: { fontSize: 24, marginBottom: 8 },
  errorText: { fontSize: 13, color: '#B42318', textAlign: 'center', marginBottom: 12, fontWeight: '500' },
  retryButton: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E4002B' },
  retryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
});

export default AudioPlayer;