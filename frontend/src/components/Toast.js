import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Text, View, StyleSheet, TouchableOpacity} from 'react-native';
import {dismissSosToast, subscribeSosToasts} from '../features/sos/services/sosToastService';

const TYPE_DETAILS = {
  success: {title: 'Success', icon: '+', container: 'successContainer', iconContainer: 'successIcon'},
  error: {title: 'Action needed', icon: '!', container: 'errorContainer', iconContainer: 'errorIcon'},
  warning: {title: 'Attention', icon: '!', container: 'warningContainer', iconContainer: 'warningIcon'},
  info: {title: 'SOS update', icon: 'i', container: 'infoContainer', iconContainer: 'infoIcon'},
};

/** Presentation-only host for the centralized SOS toast queue. */
const Toast = ({visible = false, message = '', type = 'success', duration = 4500, onHide}) => {
  const [queuedToast, setQueuedToast] = useState(null);
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);

  useEffect(() => {
    const subscription = subscribeSosToasts(setQueuedToast);
    return () => subscription.remove();
  }, []);

  const currentToast = useMemo(() => queuedToast || (visible ? {id: 'legacy', message, type, duration} : null), [duration, message, queuedToast, type, visible]);
  const hideToast = useCallback(() => {
    if (!currentToast || dismissing.current) return;
    dismissing.current = true;
    Animated.parallel([
      Animated.timing(translateY, {toValue: -120, duration: 180, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 0, duration: 160, useNativeDriver: true}),
    ]).start(() => {
      dismissing.current = false;
      if (queuedToast?.id === currentToast.id) dismissSosToast(currentToast.id);
      onHide?.();
    });
  }, [currentToast, onHide, opacity, queuedToast?.id, translateY]);

  useEffect(() => {
    if (!currentToast) {
      translateY.setValue(-120);
      opacity.setValue(0);
      return undefined;
    }
    Animated.parallel([
      Animated.timing(translateY, {toValue: 0, duration: 260, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}),
    ]).start();
    const timer = setTimeout(hideToast, currentToast.duration || 4500);
    return () => clearTimeout(timer);
  }, [currentToast, hideToast, opacity, translateY]);

  if (!currentToast) return null;
  const details = TYPE_DETAILS[currentToast.type] || TYPE_DETAILS.info;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrapper, {opacity, transform: [{translateY}]}]}>
      <View style={[styles.toast, styles[details.container]]}>
        <View style={[styles.iconContainer, styles[details.iconContainer]]}><Text style={styles.icon}>{details.icon}</Text></View>
        <View style={styles.copy}><Text style={styles.title}>{currentToast.title || details.title}</Text><Text style={styles.message} numberOfLines={2}>{currentToast.message}</Text></View>
        <TouchableOpacity accessibilityLabel="Dismiss notification" style={styles.closeButton} activeOpacity={0.7} onPress={hideToast}><Text style={styles.closeText}>×</Text></TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {position: 'absolute', top: 52, left: 16, right: 16, zIndex: 9999, elevation: 9999},
  toast: {minHeight: 70, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', shadowColor: '#0B1220', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.18, shadowRadius: 12, elevation: 9},
  successContainer: {backgroundColor: '#ECFDF3', borderWidth: 1, borderColor: '#ABEFC6'}, errorContainer: {backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA'}, warningContainer: {backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEDF89'}, infoContainer: {backgroundColor: '#EFF8FF', borderWidth: 1, borderColor: '#B2DDFF'},
  iconContainer: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10}, successIcon: {backgroundColor: '#16A34A'}, errorIcon: {backgroundColor: '#D92D20'}, warningIcon: {backgroundColor: '#DC8B00'}, infoIcon: {backgroundColor: '#1570EF'},
  icon: {color: '#FFFFFF', fontSize: 17, fontWeight: '900'}, copy: {flex: 1}, title: {color: '#182230', fontSize: 13, fontWeight: '800', marginBottom: 2}, message: {color: '#475467', fontSize: 12, fontWeight: '600', lineHeight: 17},
  closeButton: {width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 5}, closeText: {color: '#667085', fontSize: 21, fontWeight: '400'},
});

export default Toast;