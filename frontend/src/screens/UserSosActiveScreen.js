import React, {useEffect, useState} from 'react';
import {SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {getSos} from '../api/resources';
import {getCachedApiData} from '../api/client';

const UserSosActiveScreen = ({sos, token, onBack}) => {
  const [detail, setDetail] = useState(sos || null);
  const [error, setError] = useState('');
  const recordId = sos?.id || sos?._id;

  useEffect(() => {
    setError('');
    if (!token || !recordId) return undefined;
    const cached = getCachedApiData(`/sos/${recordId}`, token);
    if (cached?.sos) setDetail(cached.sos);
    let mounted = true;
    getSos(token, recordId)
      .then(result => mounted && result?.sos && setDetail(result.sos))
      .catch(requestError => mounted && setError(requestError.message || 'Unable to load SOS details.'));
    return () => { mounted = false; };
  }, [recordId, token]);

  if (!detail) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.title}>SOS unavailable</Text>
        <Text style={styles.text}>{error || 'The emergency record could not be loaded.'}</Text>
        <TouchableOpacity onPress={onBack}><Text style={styles.link}>Back</Text></TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <Text style={styles.title}>SOS status</Text>
        <Text style={styles.status}>{String(detail.status || 'active').toUpperCase()}</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={styles.text}>The app keeps the user on the normal Home dashboard while the SOS workflow runs in the background.</Text>
      </View>
      <TouchableOpacity style={styles.backButton} onPress={onBack}><Text style={styles.backText}>Back to Home</Text></TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F7F7F8', justifyContent: 'center', padding: 24},
  content: {alignItems: 'center'},
  title: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', textAlign: 'center'},
  status: {fontSize: 28, fontWeight: '900', color: '#E4002B', marginTop: 12},
  text: {fontSize: 15, color: '#59636E', textAlign: 'center', marginTop: 12, lineHeight: 22},
  error: {fontSize: 13, color: '#B42318', textAlign: 'center', marginTop: 10},
  backButton: {backgroundColor: '#E4002B', paddingVertical: 16, borderRadius: 12, marginTop: 28, alignItems: 'center'},
  backText: {color: '#FFF', fontWeight: '800'},
  link: {color: '#E4002B', textAlign: 'center', marginTop: 20},
});

export default UserSosActiveScreen;
