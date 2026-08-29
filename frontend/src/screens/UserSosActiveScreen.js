import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Alert, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {cancelSos, getLiveLocation, startLiveLocation, stopLiveLocation} from '../api/resources';

const UserSosActiveScreen = ({token, sos, onBack, onCancelSos, onViewContacts}) => {
  const [liveLocation, setLiveLocation] = useState(null);
  const [sharing, setSharing] = useState(sos?.liveLocationStatus === 'ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const id = sos?.backendId || sos?._id;

  useEffect(() => {
    if (!token || !id || !sos?.backendId) { setLoading(false); return undefined; }
    let mounted = true;
    getLiveLocation(token, id)
      .then(result => mounted && setLiveLocation(result))
      .catch(requestError => mounted && setError(requestError.message))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [id, token, sos?.backendId]);

  const toggleSharing = async () => {
    try {
      if (!sos?.backendId) {
        setError('Live location will be available after the SOS synchronizes.');
        return;
      }
      if (sharing) await stopLiveLocation(token, id);
      else await startLiveLocation(token, id);
      setSharing(!sharing);
    } catch (requestError) { setError(requestError.message); }
  };

  const cancel = () => Alert.alert('Cancel Emergency SOS', 'Cancel this active emergency?', [{text: 'Keep active', style: 'cancel'}, {text: 'Cancel SOS', style: 'destructive', onPress: async () => { try { if (sos?.backendId) await cancelSos(token, id); onCancelSos?.(); } catch (requestError) { setError(requestError.message); } }}]);

  if (!sos) return <SafeAreaView style={styles.safe}><Text style={styles.title}>SOS unavailable</Text><Text style={styles.text}>The emergency record could not be loaded.</Text><TouchableOpacity onPress={onBack}><Text style={styles.link}>Back</Text></TouchableOpacity></SafeAreaView>;
  const location = liveLocation?.lastLocation || sos.location;
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#E4002B" />
    <View style={styles.header}><TouchableOpacity onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity><View><Text style={styles.headerTitle}>Emergency SOS</Text><Text style={styles.live}>● {sos.status.toUpperCase()}</Text></View></View>
    <View style={styles.content}>
      <View style={styles.hero}><Text style={styles.heroMark}>!</Text><Text style={styles.heroTitle}>SOS IS {sos.status.toUpperCase()}</Text><Text style={styles.text}>{sos.emergencyMessage}</Text></View>
      <View style={styles.card}><Text style={styles.cardTitle}>LIVE LOCATION</Text>{loading ? <ActivityIndicator color="#E4002B" /> : location?.latitude != null ? <Text style={styles.coordinate}>{location.latitude}, {location.longitude}</Text> : <Text style={styles.text}>Location unavailable</Text>}{error ? <Text style={styles.error}>{error}</Text> : null}</View>
      <TouchableOpacity style={[styles.share, sharing && styles.shareActive]} onPress={toggleSharing}><Text style={styles.shareText}>{sharing ? 'STOP SHARING' : 'START LIVE LOCATION'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={onViewContacts}><Text style={styles.secondaryText}>View safety contacts</Text></TouchableOpacity>
      <TouchableOpacity style={styles.cancel} onPress={cancel}><Text style={styles.cancelText}>Cancel Emergency SOS</Text></TouchableOpacity>
    </View>
  </SafeAreaView>;
};

const styles = StyleSheet.create({safe: {flex: 1, backgroundColor: '#F7F7F8'}, header: {backgroundColor: '#E4002B', padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14}, back: {fontSize: 36, color: '#FFF'}, headerTitle: {fontSize: 20, fontWeight: '900', color: '#FFF'}, live: {fontSize: 11, color: '#FFE5E8', marginTop: 4}, content: {padding: 20}, hero: {alignItems: 'center', paddingVertical: 36}, heroMark: {fontSize: 52, fontWeight: '900', color: '#E4002B'}, heroTitle: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginTop: 12}, text: {fontSize: 14, color: '#59636E', marginTop: 8, textAlign: 'center'}, card: {backgroundColor: '#FFF', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#ECECEF'}, cardTitle: {fontSize: 11, fontWeight: '900', letterSpacing: 1, color: '#A1A1A6', marginBottom: 12}, coordinate: {fontSize: 18, fontWeight: '800', color: '#1A1A1A'}, error: {color: '#B42318', marginTop: 10}, share: {backgroundColor: '#E4002B', padding: 17, borderRadius: 12, alignItems: 'center', marginTop: 18}, shareActive: {backgroundColor: '#1A1A1A'}, shareText: {color: '#FFF', fontWeight: '800'}, secondary: {padding: 16, alignItems: 'center'}, secondaryText: {color: '#E4002B', fontWeight: '800'}, cancel: {borderWidth: 1, borderColor: '#E4002B', padding: 16, borderRadius: 12, alignItems: 'center'}, cancelText: {color: '#E4002B', fontWeight: '800'}, title: {fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 80}, link: {color: '#E4002B', textAlign: 'center', marginTop: 20}});

export default UserSosActiveScreen;
