import React, {useEffect, useMemo, useState} from 'react';
import {Image, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from '../components/Icon';
import AudioPlayer from '../components/AudioPlayer';
import {API_BASE_URL} from '../api/config';
import {buildMediaRequestOptions, buildMediaUrl} from '../utils/media';

const hasStoredMedia = component => (
  String(component?.status || '').toLowerCase() === 'success' &&
  typeof component?.storageRef === 'string' &&
  component.storageRef.trim().length > 0
);

const UserNotificationDetailScreen = ({notification, onBack, onViewSos, token}) => {
  const sosId = notification?.sosId && typeof notification.sosId === 'object'
    ? notification.sosId._id || notification.sosId.id
    : notification?.sosId;
  const sos = notification?.sosId && typeof notification.sosId === 'object' ? notification.sosId : null;
  const [hiddenImages, setHiddenImages] = useState({front: false, back: false});

  useEffect(() => {
    setHiddenImages({front: false, back: false});
  }, [notification]);

  const media = sos?.components || {};
  const frontMediaUrl = useMemo(
    () => hasStoredMedia(media.frontImage) && sosId ? buildMediaUrl(API_BASE_URL, sosId, 'frontImage') : null,
    [media.frontImage, sosId],
  );
  const backMediaUrl = useMemo(
    () => hasStoredMedia(media.backImage) && sosId ? buildMediaUrl(API_BASE_URL, sosId, 'backImage') : null,
    [media.backImage, sosId],
  );
  const audioMediaUrl = useMemo(
    () => hasStoredMedia(media.audio) && sosId ? buildMediaUrl(API_BASE_URL, sosId, 'audio') : null,
    [media.audio, sosId],
  );
  const imageOptions = buildMediaRequestOptions(token);
  const visibleImageCount = Number(Boolean(frontMediaUrl && !hiddenImages.front)) + Number(Boolean(backMediaUrl && !hiddenImages.back));

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} accessibilityLabel="Back to notifications"><Icon name="back" size={22} color="#1A1A1A" /></TouchableOpacity>
        <Text style={styles.title}>Notification</Text>
      </View>

      {notification ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Icon name={notification.sosId ? 'sos' : 'notifications'} size={44} color="#E4002B" />
          <Text style={styles.heading}>{notification.title || 'Notification'}</Text>
          <Text style={styles.body}>{notification.body || 'No notification message was provided.'}</Text>
          <Text style={styles.time}>{notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Time unavailable'}</Text>

          {sos ? (
            <View style={styles.metaBox}>
              <Text style={styles.metaLabel}>SOS status</Text>
              <Text style={styles.metaValue}>{String(sos.status || 'unknown').toUpperCase()}</Text>
              <Text style={styles.metaLabel}>Emergency message</Text>
              <Text style={styles.metaValue}>{sos.emergencyMessage || 'No emergency message was recorded.'}</Text>
            </View>
          ) : null}

          {sos ? (
            <View style={styles.mediaBlock}>
              <Text style={styles.mediaTitle}>Photos</Text>
              {frontMediaUrl && !hiddenImages.front ? <Image source={{uri: frontMediaUrl, ...imageOptions}} style={styles.image} onError={() => setHiddenImages(current => ({...current, front: true}))} accessibilityLabel="SOS front photo" /> : null}
              {backMediaUrl && !hiddenImages.back ? <Image source={{uri: backMediaUrl, ...imageOptions}} style={styles.image} onError={() => setHiddenImages(current => ({...current, back: true}))} accessibilityLabel="SOS back photo" /> : null}
              {visibleImageCount === 0 ? <Text style={styles.emptyMedia}>No successfully stored photos are available.</Text> : null}
            </View>
          ) : null}

          {sos ? (
            <View style={styles.mediaBlock}>
              <Text style={styles.mediaTitle}>Audio</Text>
              {audioMediaUrl ? <AudioPlayer audioUrl={audioMediaUrl} token={token} /> : <Text style={styles.emptyMedia}>No successfully stored audio is available.</Text>}
            </View>
          ) : null}

          {sosId ? <TouchableOpacity style={styles.button} onPress={() => onViewSos?.(sosId)}><Text style={styles.buttonText}>Open SOS details</Text></TouchableOpacity> : null}
        </ScrollView>
      ) : <View style={styles.content}><Text style={styles.heading}>Notification unavailable</Text><Text style={styles.body}>This notification record is no longer available.</Text></View>}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F7F7F8'},
  header: {backgroundColor: '#FFF', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderBottomWidth: 1, borderBottomColor: '#E8E8EB'},
  title: {fontSize: 21, fontWeight: '900', color: '#1A1A1A'},
  content: {padding: 24, alignItems: 'center'},
  heading: {fontSize: 21, fontWeight: '900', color: '#1A1A1A', textAlign: 'center', marginTop: 14},
  body: {fontSize: 15, color: '#59636E', textAlign: 'center', marginTop: 12},
  time: {fontSize: 12, color: '#A1A1A6', marginTop: 12},
  metaBox: {width: '100%', backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 18},
  metaLabel: {fontSize: 11, fontWeight: '800', color: '#7D8794', marginTop: 8},
  metaValue: {fontSize: 15, color: '#1A1A1A', marginTop: 4},
  mediaBlock: {width: '100%', marginTop: 20},
  mediaTitle: {fontSize: 14, fontWeight: '800', color: '#1A1A1A', marginBottom: 8},
  image: {width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: '#E5E7EB'},
  emptyMedia: {backgroundColor: '#FFF', borderRadius: 12, color: '#59636E', padding: 14, textAlign: 'center'},
  button: {backgroundColor: '#E4002B', padding: 15, borderRadius: 12, marginTop: 22, width: '100%'},
  buttonText: {color: '#FFF', fontWeight: '800', textAlign: 'center'},
});

export default UserNotificationDetailScreen;