import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Animated, Text, View, StyleSheet, TouchableOpacity} from 'react-native';
import {dismissSosToast, subscribeSosToasts} from '../features/sos/services/sosToastService';

const TYPE_DETAILS = {
  success: {title: 'Success', icon: '+', container: 'successContainer', iconContainer: 'successIcon'},
  error: {title: 'Action needed', icon: '!', container: 'errorContainer', iconContainer: 'errorIcon'},
  warning: {title: 'Attention', icon: '!', container: 'warningContainer', iconContainer: 'warningIcon'},
  info: {title: 'SOS update', icon: 'i', container: 'infoContainer', iconContainer: 'infoIcon'},
};

/** Presentation-only host for the centralized SOS toast stack. */
const ToastCard = ({toast, onHide}) => {
  const translateY = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissing = useRef(false);
  const hideToast = useCallback(() => {
    if (dismissing.current) return;
    dismissing.current = true;
    Animated.parallel([
      Animated.timing(translateY, {toValue: -120, duration: 180, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 0, duration: 160, useNativeDriver: true}),
    ]).start(() => {
      dismissing.current = false;
      dismissSosToast(toast.id);
      onHide?.();
    });
  }, [onHide, opacity, toast.id, translateY]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {toValue: 0, duration: 260, useNativeDriver: true}),
      Animated.timing(opacity, {toValue: 1, duration: 200, useNativeDriver: true}),
    ]).start();
    const timer = setTimeout(hideToast, toast.duration || 4500);
    return () => clearTimeout(timer);
  }, [hideToast, opacity, toast.duration, translateY]);

  const details = TYPE_DETAILS[toast.type] || TYPE_DETAILS.info;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrapper, {opacity, transform: [{translateY}]}]}>
      <View style={[styles.toast, styles[details.container]]}>
        <View style={[styles.iconContainer, styles[details.iconContainer]]}><Text style={styles.icon}>{details.icon}</Text></View>
        <View style={styles.copy}><Text style={styles.title}>{toast.title || details.title}</Text><Text style={styles.message} numberOfLines={2}>{toast.message}</Text></View>
        <TouchableOpacity accessibilityLabel="Dismiss notification" style={styles.closeButton} activeOpacity={0.7} onPress={hideToast}><Text style={styles.closeText}>×</Text></TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const Toast = ({visible = false, message = '', type = 'success', duration = 4500, onHide}) => {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const subscription = subscribeSosToasts(setToasts);
    return () => subscription.remove();
  }, []);
  const legacy = visible ? [{id: 'legacy', message, type, duration}] : [];
  const active = toasts.length ? toasts : legacy;
  return <View pointerEvents="box-none" style={styles.stack}>{active.map(toast => <ToastCard key={toast.id} toast={toast} onHide={onHide} />)}</View>;
};

const styles = StyleSheet.create({
  wrapper: {position: 'relative', left: 0, right: 0, zIndex: 9999, elevation: 9999},
  stack: {position: 'absolute', top: 52, left: 16, right: 16, zIndex: 9999, elevation: 9999, gap: 10},
  toast: {minHeight: 70, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', shadowColor: '#0B1220', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.18, shadowRadius: 12, elevation: 9},
  successContainer: {backgroundColor: '#ECFDF3', borderWidth: 1, borderColor: '#ABEFC6'}, errorContainer: {backgroundColor: '#FEF3F2', borderWidth: 1, borderColor: '#FECDCA'}, warningContainer: {backgroundColor: '#FFFAEB', borderWidth: 1, borderColor: '#FEDF89'}, infoContainer: {backgroundColor: '#EFF8FF', borderWidth: 1, borderColor: '#B2DDFF'},
  iconContainer: {width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 10}, successIcon: {backgroundColor: '#16A34A'}, errorIcon: {backgroundColor: '#D92D20'}, warningIcon: {backgroundColor: '#DC8B00'}, infoIcon: {backgroundColor: '#1570EF'},
  icon: {color: '#FFFFFF', fontSize: 17, fontWeight: '900'}, copy: {flex: 1}, title: {color: '#182230', fontSize: 13, fontWeight: '800', marginBottom: 2}, message: {color: '#475467', fontSize: 12, fontWeight: '600', lineHeight: 17},
  closeButton: {width: 30, height: 30, alignItems: 'center', justifyContent: 'center', marginLeft: 5}, closeText: {color: '#667085', fontSize: 21, fontWeight: '400'},
});

export default Toast;