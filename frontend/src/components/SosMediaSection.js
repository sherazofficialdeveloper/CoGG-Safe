// AudioPlayer.js - TrackPlayer Version (Fixed - Replayable)
import React, {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import TrackPlayer, {
  Capability,
  State,
  usePlaybackState,
  useProgress,
} from 'react-native-track-player';

// ================= Setup TrackPlayer =================
const setupTrackPlayer = async () => {
  try {
    await TrackPlayer.setupPlayer();
    await TrackPlayer.updateOptions({
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
      ],
    });
  } catch (error) {
    if (!String(error?.message || '').includes('already been initialized')) {
      console.log('[AudioPlayer] Setup error:', error);
    }
  }
};

const AudioPlayer = ({
  audioUrl,
  token,
  publicMedia = false,
  onError = null,
  style = {},
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  const playbackState = usePlaybackState();
  const progress = useProgress();
  const isPlaying = playbackState === State.Playing;

  // ================= Setup TrackPlayer =================
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await setupTrackPlayer();
      if (mounted) setIsSetup(true);
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // ================= Load Audio =================
  useEffect(() => {
    if (!isSetup) return;

    let cancelled = false;

    const loadAudio = async () => {
      if (!audioUrl) {
        setError('No audio source');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        console.log('[AudioPlayer] Loading audio:', audioUrl);

        await TrackPlayer.reset();

        if (cancelled) return;

        const track = {
          id: `sos-audio-${Date.now()}`,
          url: audioUrl,
          type: 'default',
          title: 'SOS Voice Recording',
          artist: 'CoGG Safe',
        };

        if (!publicMedia && token) {
          track.headers = {
            Authorization: `Bearer ${token}`,
          };
          console.log('[AudioPlayer] Using headers for private media');
        } else {
          console.log('[AudioPlayer] Using public media (no headers)');
        }

        await TrackPlayer.add(track);

        if (cancelled) return;

        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.log('[AudioPlayer] Load error:', err);
        setError('Could not load audio');
        setIsLoading(false);
        if (onError) onError(err);
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, token, publicMedia, isSetup]);

  // ================= Cleanup on unmount =================
  useEffect(() => {
    return () => {
      try {
        TrackPlayer.reset();
      } catch (_) {}
    };
  }, []);

  // ================= Play / Pause =================
  const handlePlayPause = async () => {
    if (!isReady) return;
    try {
      if (isPlaying) {
        await TrackPlayer.pause();
        return;
      }

      // ✅ FIX: If track has ended or is at the end, seek to 0 before play
      const currentProgress = await TrackPlayer.getProgress();
      const duration = currentProgress.duration || 0;
      const position = currentProgress.position || 0;

      // If track ended or nearly at end, reset to start
      if (duration > 0 && position >= duration - 0.5) {
        await TrackPlayer.seekTo(0);
        console.log('[AudioPlayer] Rewinding to start before replay');
      }

      // Also reset if state is Ended
      const state = await TrackPlayer.getState();
      if (state === State.Ended) {
        await TrackPlayer.seekTo(0);
        console.log('[AudioPlayer] Track ended — seek to 0');
      }

      await TrackPlayer.play();
    } catch (err) {
      console.log('[AudioPlayer] Play/Pause error:', err);
    }
  };

  // ================= Stop =================
  const handleStop = async () => {
    try {
      await TrackPlayer.stop();
      await TrackPlayer.seekTo(0);
      console.log('[AudioPlayer] Stopped and rewound');
    } catch (err) {
      console.log('[AudioPlayer] Stop error:', err);
    }
  };

  // ================= Format time =================
  const formatTime = (seconds) => {
    const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  // ================= Retry =================
  const handleRetry = async () => {
    setError(null);
    setIsLoading(true);
    setIsReady(false);
    try {
      await TrackPlayer.reset();
    } catch (_) {}
    setIsSetup(false);
    setTimeout(() => setIsSetup(true), 100);
  };

  // ================= Error state =================
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

  // ================= Loading state =================
  if (isLoading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#E4002B" />
          <Text style={styles.loadingText}>Loading audio...</Text>
        </View>
      </View>
    );
  }

  const duration = progress.duration || 0;
  const currentTime = progress.position || 0;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.playerBox, !isReady && styles.playerBoxDisabled]}>
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={handlePlayPause}
            style={[styles.playButton, !isReady && styles.playButtonDisabled]}
            activeOpacity={0.7}
            disabled={!isReady}
          >
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color={isReady ? '#FFFFFF' : '#999999'}
            />
          </TouchableOpacity>

          <View style={styles.timeInfo}>
            <Text style={styles.timeText}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>

          {isPlaying && isReady && (
            <TouchableOpacity
              onPress={handleStop}
              style={styles.stopButton}
              activeOpacity={0.7}
            >
              <Icon name="stop" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${
                    duration > 0 ? (currentTime / duration) * 100 : 0
                  }%`,
                },
              ]}
            />
          </View>
        </View>

        {!isReady && (
          <Text style={styles.noSoundText}>Audio not available</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 4,
    paddingHorizontal: 2,
  },

  playerBox: {
    backgroundColor: '#F5F6F8',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  playerBoxDisabled: {
    opacity: 0.6,
  },

  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  playButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  playButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },

  timeInfo: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  timeText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },

  stopButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFF5F6',
    borderWidth: 1,
    borderColor: '#F3B5BF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  progressContainer: {
    marginTop: 8,
    width: '100%',
  },

  progressBar: {
    height: 3,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#E4002B',
    borderRadius: 2,
  },

  noSoundText: {
    textAlign: 'center',
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
  },

  loadingBox: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F6F8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  loadingText: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },

  errorBox: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  errorIcon: {
    fontSize: 20,
    marginBottom: 4,
  },

  errorText: {
    fontSize: 12,
    color: '#B42318',
    textAlign: 'center',
    marginBottom: 8,
    fontWeight: '500',
  },

  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#E4002B',
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});

export default AudioPlayer;