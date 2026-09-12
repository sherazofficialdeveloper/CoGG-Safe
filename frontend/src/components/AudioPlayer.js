// AudioPlayer.js - TrackPlayer Version
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
    if (
      !String(error?.message || '').includes(
        'already been initialized',
      )
    ) {
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
  fallbackDuration = 0,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isSetup, setIsSetup] = useState(false);

  const playbackState = usePlaybackState();
  const progress = useProgress();

  /*
   * TrackPlayer 4.x mein usePlaybackState()
   * direct State value nahi deta.
   *
   * Isliye actual state:
   * playbackState?.state
   */
  const currentPlaybackState = playbackState?.state;

  const isPlaying =
    currentPlaybackState === State.Playing;

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      await setupTrackPlayer();

      if (mounted) {
        setIsSetup(true);
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isSetup) {
      return;
    }

    let cancelled = false;

    const loadAudio = async () => {
      if (!audioUrl) {
        setError('No audio source');
        setIsLoading(false);
        setIsReady(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        setIsReady(false);

        console.log(
          '[AudioPlayer] Loading audio:',
          audioUrl,
        );

        /*
         * Purani track remove karo.
         */
        await TrackPlayer.reset();

        if (cancelled) {
          return;
        }

        const track = {
          id: `sos-audio-${Date.now()}`,
          url: audioUrl,
          type: 'default',
          title: 'SOS Voice Recording',
          artist: 'CoGG Safe',
        };

        /*
         * Private media ke liye Authorization header.
         */
        if (!publicMedia && token) {
          track.headers = {
            Authorization: `Bearer ${token}`,
          };

          console.log(
            '[AudioPlayer] Using headers for private media',
          );
        } else {
          console.log(
            '[AudioPlayer] Using public media (no headers)',
          );
        }

        await TrackPlayer.add(track);

        if (cancelled) {
          return;
        }

        /*
         * IMPORTANT:
         * RepeatMode intentionally use nahi kiya gaya.
         *
         * Audio ek baar complete hone ke baad Ended state
         * mein jayegi aur automatically repeat nahi hogi.
         */

        setIsReady(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }

        console.log(
          '[AudioPlayer] Load error:',
          err,
        );

        setError('Could not load audio');
        setIsLoading(false);
        setIsReady(false);

        if (onError) {
          onError(err);
        }
      }
    };

    loadAudio();

    return () => {
      cancelled = true;
    };
  }, [audioUrl, token, publicMedia, isSetup]);

  useEffect(() => {
    return () => {
      try {
        TrackPlayer.reset();
      } catch (_) {}
    };
  }, []);

  /*
   * WhatsApp-style Play / Pause behavior:
   *
   * Playing  -> Pause
   * Paused   -> Resume from current position
   * Ended    -> Seek 0 and Play
   */
  const handlePlayPause = async () => {
    if (!isReady) {
      return;
    }

    try {
      /*
       * Currently playing hai to pause karo.
       * Position wahi rahegi.
       */
      if (isPlaying) {
        console.log('[AudioPlayer] Pausing audio');

        await TrackPlayer.pause();

        return;
      }

      /*
       * Audio complete ho chuki hai.
       * Next Play click par 0:00 se start karo.
       */
      if (currentPlaybackState === State.Ended) {
        console.log(
          '[AudioPlayer] Audio ended, restarting from 0',
        );

        await TrackPlayer.seekTo(0);
      }

      /*
       * Paused hai to current position se resume hoga.
       * Ended hai to upar seekTo(0) ke baad 0:00 se chalega.
       */
      console.log('[AudioPlayer] Playing audio');

      await TrackPlayer.play();
    } catch (err) {
      console.log(
        '[AudioPlayer] Play/Pause error:',
        err,
      );
    }
  };

  /*
   * Stop:
   * Audio stop + position 0:00
   */
  const handleStop = async () => {
    try {
      console.log('[AudioPlayer] Stopping audio');

      await TrackPlayer.stop();
      await TrackPlayer.seekTo(0);
    } catch (err) {
      console.log(
        '[AudioPlayer] Stop error:',
        err,
      );
    }
  };

  const formatTime = seconds => {
    const s = Number.isFinite(seconds)
      ? Math.max(0, seconds)
      : 0;

    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);

    return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const handleRetry = async () => {
    setError(null);
    setIsLoading(true);
    setIsReady(false);

    try {
      await TrackPlayer.reset();
    } catch (_) {}

    setIsSetup(false);

    setTimeout(() => {
      setIsSetup(true);
    }, 100);
  };

  /*
   * Error UI
   */
  if (error) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>⚠️</Text>

          <Text style={styles.errorText}>
            {error}
          </Text>

          <TouchableOpacity
            onPress={handleRetry}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>
              Retry
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /*
   * Loading UI
   */
  if (isLoading) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator
            size="small"
            color="#E4002B"
          />

          <Text style={styles.loadingText}>
            Loading audio...
          </Text>
        </View>
      </View>
    );
  }

  const duration = progress.duration > 0 ? progress.duration : Number(fallbackDuration) || 0;
  const currentTime = progress.position || 0;

  const progressPercentage =
    duration > 0
      ? Math.min(
          100,
          Math.max(
            0,
            (currentTime / duration) * 100,
          ),
        )
      : 0;

  return (
    <View style={[styles.container, style]}>
      <View
        style={[
          styles.playerBox,
          !isReady && styles.playerBoxDisabled,
        ]}
      >
        <View style={styles.controlsRow}>
          <TouchableOpacity
            onPress={handlePlayPause}
            style={[
              styles.playButton,
              !isReady &&
                styles.playButtonDisabled,
            ]}
            activeOpacity={0.7}
            disabled={!isReady}
          >
            <Icon
              name={
                isPlaying
                  ? 'pause'
                  : 'play'
              }
              size={20}
              color={
                isReady
                  ? '#FFFFFF'
                  : '#999999'
              }
            />
          </TouchableOpacity>

          <View style={styles.timeInfo}>
            <Text style={styles.timeText}>
              {formatTime(currentTime)} /{' '}
              {formatTime(duration)}
            </Text>
          </View>

          {isPlaying && isReady && (
            <TouchableOpacity
              onPress={handleStop}
              style={styles.stopButton}
              activeOpacity={0.7}
            >
              <Icon
                name="stop"
                size={18}
                color="#FF6B6B"
              />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${progressPercentage}%`,
                },
              ]}
            />
          </View>
        </View>

        {!isReady && (
          <Text style={styles.noSoundText}>
            Audio not available
          </Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },

  playerBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  playerBoxDisabled: {
    opacity: 0.7,
  },

  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  playButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  playButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },

  timeInfo: {
    flex: 1,
    marginLeft: 12,
  },

  timeText: {
    fontSize: 13,
    color: '#555555',
    fontWeight: '500',
  },

  stopButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F1',
  },

  progressContainer: {
    marginTop: 12,
  },

  progressBar: {
    height: 5,
    width: '100%',
    backgroundColor: '#E5E5E5',
    borderRadius: 3,
    overflow: 'hidden',
  },

  progressFill: {
    height: '100%',
    backgroundColor: '#E4002B',
    borderRadius: 3,
  },

  loadingBox: {
    minHeight: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E5E5',
  },

  loadingText: {
    marginLeft: 10,
    fontSize: 13,
    color: '#666666',
  },

  errorBox: {
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD6D6',
  },

  errorIcon: {
    fontSize: 22,
    marginBottom: 6,
  },

  errorText: {
    fontSize: 13,
    color: '#C62828',
    textAlign: 'center',
    marginBottom: 12,
  },

  retryButton: {
    backgroundColor: '#E4002B',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },

  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  noSoundText: {
    marginTop: 8,
    fontSize: 12,
    color: '#999999',
    textAlign: 'center',
  },
});

export default AudioPlayer;