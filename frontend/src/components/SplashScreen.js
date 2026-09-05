import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';

export default function SplashScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.brandWrap}>
        <Image source={require('../public/logo.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>CoGG Safe</Text>
        <Text style={styles.subtitle}>Your safety, always connected.</Text>
        <View style={styles.loadingTrack}><View style={styles.loadingBar} /></View>
      </View>
      <Text style={styles.footer}>Secure emergency protection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F7F7F8', alignItems: 'center', justifyContent: 'center', padding: 28},
  brandWrap: {alignItems: 'center', width: '100%'},
  logo: {width: 118, height: 118, borderRadius: 26},
  title: {marginTop: 22, fontSize: 30, fontWeight: '900', color: '#1A1A1A', letterSpacing: 0.2},
  subtitle: {marginTop: 8, fontSize: 14, color: '#667085', fontWeight: '600', textAlign: 'center'},
  loadingTrack: {marginTop: 28, width: 150, height: 4, borderRadius: 4, backgroundColor: '#E5E7EB', overflow: 'hidden'},
  loadingBar: {width: '55%', height: '100%', backgroundColor: '#E4002B', borderRadius: 4},
  footer: {position: 'absolute', bottom: 32, fontSize: 12, color: '#98A2B3', fontWeight: '600'},
});
