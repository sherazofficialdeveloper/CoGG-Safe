import React, {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {downloadAuthenticatedSosMedia} from '../features/sos/services/nativeMedia';
import {emitSosDiagnostic} from '../features/sos/services/sosDiagnosticService';

let Sound = null;
if (typeof jest === 'undefined') {
  try {
    Sound = require('react-native-sound');
  } catch (error) {
    Sound = null;
  }
}

const AudioPlayer = ({audioUrl, localPath = null, token, onError = null, style = {}}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sound, setSound] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let isMounted = true;
    let loadedSound = null;

    const fail = (message, cause) => {
      if (!isMounted) return;
      setError(message);
      setIsLoading(false);
      if (onError) onError(cause || new Error(message));
    };

    const initializeAudio = async () => {
      if (!audioUrl && !localPath) return fail('No stored audio is available.');
      if (!Sound) return fail('Audio playback is unavailable in this environment.');

      try {
        setIsLoading(true);
        setError(null);
        // Pending SOS media already lives in the app-private files directory.
        // Prefer it so playback works offline and before backend upload.
        // Protected remote media is downloaded with the JWT because
        // react-native-sound cannot attach request headers itself.
        let playablePath = localPath;
        if (!playablePath) {
          if (!token) return fail('Audio cannot be loaded because this session has no authentication token.');
          playablePath = await downloadAuthenticatedSosMedia(audioUrl, token);
          emitSosDiagnostic('SOS DEBUG AUDIO 08: Download completed');
        }
        if (!isMounted) return;

        loadedSound = new Sound(playablePath, '', loadError => {
          if (!isMounted) return;
          if (loadError) return fail('Stored audio could not be played.', loadError);
          setSound(loadedSound);
          setDuration(loadedSound.getDuration() || 0);
          emitSosDiagnostic('SOS DEBUG AUDIO 09: Playback initialized');
          setIsLoading(false);
        });
      } catch (loadError) {
        emitSosDiagnostic(`SOS DEBUG AUDIO 10: Playback/download failed: ${loadError?.message || 'unavailable'}`, 'error');
        fail('Stored audio is unavailable.', loadError);
      }
    };

    initializeAudio();
    return () => {
      isMounted = false;
      if (loadedSound) loadedSound.release();
    };
  }, [audioUrl, localPath, onError, reloadKey, token]);

  const handlePlayPause = () => {
    if (!sound) return setError('Stored audio is unavailable.');
    try {
      if (isPlaying) {
        sound.pause();
        setIsPlaying(false);
        return;
      }
      sound.play(success => {
        setIsPlaying(false);
        if (success) {
          setCurrentTime(0);
          sound.setCurrentTime(0);
        } else {
          setError('Stored audio could not finish playback.');
        }
      });
      setIsPlaying(true);
    } catch (playError) {
      setError('Stored audio could not be played.');
      if (onError) onError(playError);
    }
  };

  const handleStop = () => {
    if (!sound) return;
    sound.stop();
    sound.setCurrentTime(0);
    setIsPlaying(false);
    setCurrentTime(0);
  };

  useEffect(() => {
    if (!isPlaying || !sound) return undefined;
    const interval = setInterval(() => sound.getCurrentTime(setCurrentTime), 250);
    return () => clearInterval(interval);
  }, [isPlaying, sound]);

  const formatTime = seconds => {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mins = Math.floor(safeSeconds / 60);
    const secs = Math.floor(safeSeconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  if (error) {
    return <View style={[styles.container, style]}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => setReloadKey(value => value + 1)} style={styles.retryButton}><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View>;
  }

  return <View style={[styles.container, style]}><View style={styles.playerBox}>{isLoading ? <View style={styles.loadingContainer}><ActivityIndicator size="large" color="#007AFF" /><Text style={styles.loadingText}>Loading stored audio...</Text></View> : <><View style={styles.controlsRow}><TouchableOpacity onPress={handlePlayPause} style={styles.button} disabled={!sound}><Icon name={isPlaying ? 'pause' : 'play'} size={28} color={sound ? '#007AFF' : '#999'} /></TouchableOpacity>{isPlaying ? <TouchableOpacity onPress={handleStop} style={styles.button}><Icon name="stop" size={24} color="#FF6B6B" /></TouchableOpacity> : null}<View style={styles.timeInfo}><Text style={styles.timeText}>{formatTime(currentTime)} / {formatTime(duration)}</Text></View></View>{sound ? <View style={styles.progressBar}><View style={[styles.progressFill, {width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`}]} /></View> : null}</>}</View></View>;
};

const styles = StyleSheet.create({
  container: {width: '100%', paddingVertical: 12, paddingHorizontal: 16},
  playerBox: {backgroundColor: '#F5F5F5', borderRadius: 8, padding: 16, borderLeftWidth: 4, borderLeftColor: '#007AFF'},
  loadingContainer: {alignItems: 'center', justifyContent: 'center', paddingVertical: 24},
  loadingText: {marginTop: 12, fontSize: 14, color: '#666'},
  controlsRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 12},
  button: {width: 48, height: 48, borderRadius: 24, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1, borderColor: '#DDD'},
  timeInfo: {flex: 1, alignItems: 'flex-end'}, timeText: {fontSize: 13, color: '#666', fontWeight: '500'},
  progressBar: {height: 4, backgroundColor: '#DDD', borderRadius: 2, overflow: 'hidden'}, progressFill: {height: '100%', backgroundColor: '#007AFF'},
  errorText: {fontSize: 14, color: '#B42318', textAlign: 'center', marginBottom: 12}, retryButton: {alignSelf: 'center', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: '#007AFF', borderRadius: 4}, retryButtonText: {color: '#FFF', fontSize: 14, fontWeight: '600'},
});

export default AudioPlayer;