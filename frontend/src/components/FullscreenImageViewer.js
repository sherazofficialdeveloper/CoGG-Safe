import React, {useEffect} from 'react';
import {BackHandler, Image, Modal, Platform, SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

export default function FullscreenImageViewer({visible, uri, headers, onClose}) {
  useEffect(() => {
    if (!visible) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onClose]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity accessibilityLabel="Close image viewer" onPress={onClose} style={styles.closeButton} hitSlop={8}>
            <Text style={styles.closeText}>×</Text>
          </TouchableOpacity>
        </View>
        {uri ? <Image source={{uri, headers}} resizeMode="contain" style={styles.image} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  header: {
    alignItems: 'flex-end',
    paddingTop: Platform.OS === 'android' ? 12 : 4,
    paddingRight: 12,
    paddingBottom: 4,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {color: '#FFF', fontSize: 34, lineHeight: 38, fontWeight: '400'},
  image: {flex: 1, width: '100%', height: '100%'},
});
