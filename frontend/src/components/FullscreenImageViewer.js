import React, {useEffect} from 'react';
import {BackHandler, Image, Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

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
          <TouchableOpacity accessibilityLabel="Close image viewer" onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </TouchableOpacity>
        </View>
        {uri ? <Image source={{uri, headers}} resizeMode="contain" style={styles.image} /> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#000'},
  header: {alignItems: 'flex-end', padding: 16},
  closeButton: {paddingHorizontal: 18, paddingVertical: 10, borderRadius: 8, backgroundColor: '#FFF'},
  closeText: {color: '#000', fontWeight: '800'},
  image: {flex: 1, width: '100%', height: '100%'},
});
