import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Image, StyleSheet, Text, View} from 'react-native';

export default function SplashScreen() {
  const logoScale = useRef(new Animated.Value(0.72)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoFlip = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Logo fade in
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),

      // Logo scale
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 55,
        useNativeDriver: true,
      }),

      // 5 rapid Flip-X rotations in 1 second
      Animated.timing(logoFlip, {
        toValue: 5,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),

      // Text fade in
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 650,
        delay: 300,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),

      // Loading progress
      Animated.timing(progress, {
        toValue: 1,
        duration: 1800,
        delay: 150,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [logoOpacity, logoScale, logoFlip, textOpacity, progress]);

  const rotateX = logoFlip.interpolate({
    inputRange: [0, 1, 2, 3, 4, 5],
    outputRange: [
      '0deg',
      '360deg',
      '720deg',
      '1080deg',
      '1440deg',
      '1800deg',
    ],
  });

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.brandWrap,
          {
            opacity: logoOpacity,
            transform: [
              {perspective: 800},
              {rotateX},
              {scale: logoScale},
            ],
          },
        ]}>
        <View style={styles.logoFrame}>
          <Image
            source={require('../public/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Animated.View
          style={{
            opacity: textOpacity,
            alignItems: 'center',
          }}>
          <Text style={styles.title}>CoGG Safe</Text>

          <Text style={styles.subtitle}>
            Your safety, always connected.
          </Text>
        </Animated.View>

        <View style={styles.loadingTrack}>
          <Animated.View style={[styles.loadingBar, {width}]} />
        </View>
      </Animated.View>

      <Text style={styles.footer}>
        SECURE EMERGENCY PROTECTION
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },

  // No card, no shadow, no background, no elevation
  brandWrap: {
    alignItems: 'center',
    width: 260,
  },

  logoFrame: {
    width: 126,
    height: 126,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ECEEF1',
  },

  logo: {
    width: 104,
    height: 104,
  },

  title: {
    marginTop: 22,
    fontSize: 31,
    fontWeight: '900',
    color: '#1A1A1A',
    letterSpacing: 0.2,
  },

  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: '#667085',
    fontWeight: '600',
    textAlign: 'center',
  },

  loadingTrack: {
    marginTop: 30,
    width: 190,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },

  loadingBar: {
    height: '100%',
    backgroundColor: '#E4002B',
    borderRadius: 5,
  },

  footer: {
    position: 'absolute',
    bottom: 34,
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#98A2B3',
    fontWeight: '800',
  },
});