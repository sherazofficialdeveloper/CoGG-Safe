// AudioPlayer.js - COMPLETE FIXED
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
import RNFS from 'react-native-fs';

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
  onError = null,
  style = {},
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sound, setSound] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const soundRef = useRef(null);
  const isMountedRef = useRef(true);
  const [reloadKey, setReloadKey] = useState(0);
  const isDownloadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

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

  // ================= Download audio to local file =================
  const downloadAudioFile = async (url, authToken) => {
    if (isDownloadingRef.current) {
      console.log('[AudioPlayer] Download already in progress');
      return null;
    }

    try {
      isDownloadingRef.current = true;
      setDownloadProgress(0);

      const fileName = `audio_${Date.now()}.m4a`;
      const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
      
      console.log('[AudioPlayer] Downloading to:', filePath);

      const options = {
        fromUrl: url,
        toFile: filePath,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Accept': 'audio/*, */*',
        },
        progress: (res) => {
          const progress = (res.bytesWritten / res.contentLength) * 100;
          setDownloadProgress(progress);
        },
      };

      const result = await RNFS.downloadFile(options).promise;

      if (result.statusCode === 200) {
        console.log('[AudioPlayer] Download complete:', filePath);
        return filePath;
      } else {
        throw new Error(`Download failed with status: ${result.statusCode}`);
      }
    } catch (err) {
      console.log('[AudioPlayer] Download error:', err);
      throw err;
    } finally {
      isDownloadingRef.current = false;
    }
  };

  // ================= Initialize Audio =================
  useEffect(() => {
    const hasUrl = audioUrl && typeof audioUrl === 'string' && audioUrl.trim().length > 0;
    const hasLocalPath = localPath && typeof localPath === 'string' && localPath.trim().length > 0;

    console.log('[AudioPlayer] Init:', { hasUrl, hasLocalPath, publicMedia });

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
          const trimmedUrl = audioUrl.trim();

          // ================= FIX 1: PUBLIC MEDIA =================
          if (publicMedia) {
            playablePath = trimmedUrl;
            console.log('[AudioPlayer] Public media URL (using directly)');
          }
          // ================= FIX 2: PRIVATE MEDIA - Download first =================
          else if (token && token.trim().length > 0) {
            try {
              console.log('[AudioPlayer] Private media - downloading...');
              // Try direct URL with token first (for react-native-sound)
              // Some versions support headers in the constructor
              playablePath = trimmedUrl;
              
              // Try to download as fallback
              try {
                const downloadedPath = await downloadAudioFile(trimmedUrl, token);
                if (downloadedPath) {
                  playablePath = downloadedPath;
                  console.log('[AudioPlayer] Download complete:', downloadedPath);
                }
              } catch (downloadErr) {
                console.log('[AudioPlayer] Download failed, using direct URL:', downloadErr.message);
                // Use direct URL with token in query param as fallback
                const separator = trimmedUrl.includes('?') ? '&' : '?';
                playablePath = `${trimmedUrl}${separator}token=${encodeURIComponent(token)}`;
              }
            } catch (err) {
              console.log('[AudioPlayer] URL processing error:', err);
              setError('Could not load audio');
              setIsLoading(false);
              return;
            }
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

        // react-native-sound 0.11.x expects the second constructor
        // argument to be a base-path string, not an options/headers object.
        // Private media is already downloaded with RNFS + Authorization above,
        // so the player only needs the local file path here.
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
                  hasLoadedRef.current = true;
                }
              });
              return;
            }

            // ================= Try without headers =================
            if (token && soundPath.startsWith('http')) {
              console.log('[AudioPlayer] Retry without headers');
              const retrySound = new Sound(soundPath, '', (retryError2) => {
                if (!isMountedRef.current || isCancelled) return;
                if (retryError2) {
                  console.log('[AudioPlayer] All retries failed');
                  setError('Could not load audio');
                  setIsLoading(false);
                  if (onError) onError(retryError2);
                } else {
                  console.log('[AudioPlayer] Retry without headers success!');
                  setSound(retrySound);
                  soundRef.current = retrySound;
                  setDuration(retrySound.getDuration() || 0);
                  setIsLoading(false);
                  hasLoadedRef.current = true;
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
          hasLoadedRef.current = true;
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
  }, [audioUrl, localPath, token, publicMedia, reloadKey]);

  // ================= FIX 4: Play/Pause (No auto-play) =================
  const handlePlayPause = () => {
    if (!soundRef.current) {
      setError('Audio not available');
      return;
    }

    try {
      if (isPlaying) {
        // Pause
        soundRef.current.pause();
        setIsPlaying(false);
        return;
      }

      // Play - Only when user clicks play button
      soundRef.current.play((success) => {
        setIsPlaying(false);
        if (success) {
          setCurrentTime(0);
          if (soundRef.current) {
            soundRef.current.setCurrentTime(0);
          }
        } else {
          setError('Playback could not complete.');
        }
      });
      setIsPlaying(true);
    } catch (playError) {
      console.log('[AudioPlayer] Play error:', playError);
      setError('Could not play audio');
      if (onError) onError(playError);
    }
  };

  // ================= FIX 5: Stop =================
  const handleStop = () => {
    if (!soundRef.current) return;
    try {
      soundRef.current.stop();
      soundRef.current.setCurrentTime(0);
      setIsPlaying(false);
      setCurrentTime(0);
    } catch (stopError) {
      console.log('[AudioPlayer] Stop error:', stopError);
    }
  };

  // ================= Update current time =================
  useEffect(() => {
    if (!isPlaying || !soundRef.current) return undefined;

    const interval = setInterval(() => {
      if (soundRef.current) {
        soundRef.current.getCurrentTime((seconds) => {
          setCurrentTime(seconds || 0);
        });
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying]);

  // ================= Format time =================
  const formatTime = (seconds) => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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
    setDownloadProgress(0);
    hasLoadedRef.current = false;
    setReloadKey(prev => prev + 1);
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
          <Text style={styles.loadingText}>
            {downloadProgress > 0 ? `Loading ${Math.round(downloadProgress)}%` : 'Loading audio...'}
          </Text>
        </View>
      </View>
    );
  }

  const hasSound = !!soundRef.current;

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.playerBox, !hasSound && styles.playerBoxDisabled]}>
        <View style={styles.controlsRow}>
          
          {/* ================= FIX 6: Play/Pause Button (Smaller) ================= */}
          <TouchableOpacity
            onPress={handlePlayPause}
            style={[styles.playButton, !hasSound && styles.playButtonDisabled]}
            disabled={!hasSound}
            activeOpacity={0.7}
          >
            <Icon
              name={isPlaying ? 'pause' : 'play'}
              size={20}
              color={hasSound ? '#FFFFFF' : '#999999'}
            />
          </TouchableOpacity>

          {/* ================= Time Info ================= */}
          <View style={styles.timeInfo}>
            <Text style={styles.timeText}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </Text>
          </View>

          {/* ================= FIX 7: Stop Button (Smaller) ================= */}
          {isPlaying && hasSound && (
            <TouchableOpacity onPress={handleStop} style={styles.stopButton} activeOpacity={0.7}>
              <Icon name="stop" size={18} color="#FF6B6B" />
            </TouchableOpacity>
          )}
        </View>

        {/* ================= Progress Bar ================= */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                },
              ]}
            />
          </View>
        </View>

        {!hasSound && (
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