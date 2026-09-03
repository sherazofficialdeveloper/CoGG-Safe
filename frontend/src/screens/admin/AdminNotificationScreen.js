import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import {listNotifications, markNotificationRead} from '../../api/resources';
import {emitSosToast} from '../../features/sos/services/sosToastService';
import {getCachedApiData} from '../../api/client';

const AdminNotificationScreen = ({token, onBack, onNotificationPress, onBadgeCountChange}) => {
  const insets = useSafeAreaInsets();
  const cachedData = getCachedApiData('/notifications', token);
  const [notifications, setNotifications] = useState(() => cachedData?.notifications || []);
  const [loading, setLoading] = useState(() => !cachedData);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const unreadCount = notifications.filter(item => !item.isRead).length;

  useEffect(() => {
    if (onBadgeCountChange) {
      onBadgeCountChange(unreadCount);
    }
  }, [unreadCount, onBadgeCountChange]);

  useEffect(() => {
    let mounted = true;
    const requestId = ++requestIdRef.current;

    const loadNotifications = async () => {
      if (!token) {
        if (mounted) {
          setNotifications([]);
          setError('');
          setLoading(false);
        }
        return;
      }

      setError('');
      const existingNotifications = getCachedApiData('/notifications', token)?.notifications || [];
      if (existingNotifications.length > 0 && mounted && requestId === requestIdRef.current) {
        setNotifications(existingNotifications);
        setLoading(false);
      }

      try {
        const result = await listNotifications(token);
        if (!mounted || requestId !== requestIdRef.current) {
          return;
        }
        setNotifications(result.notifications || []);
      } catch (requestError) {
        if (!mounted || requestId !== requestIdRef.current) {
          return;
        }
        if (existingNotifications.length > 0) {
          emitSosToast(requestError.message || 'Unable to refresh notifications.', 'error');
        } else {
          setError(requestError.message || 'Unable to load notifications. Please try again later.');
        }
      } finally {
        if (mounted && requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    };

    loadNotifications();

    return () => {
      mounted = false;
      requestIdRef.current += 1;
    };
  }, [token]);

  const readNotification = notification => {
    onNotificationPress?.(notification);
    if (notification.isRead) return;
    const notificationId = notification._id || notification.id;
    markNotificationRead(token, notificationId)
      .then(() => setNotifications(items => items.map(item => (item._id || item.id) === notificationId ? {...item, isRead: true} : item)))
      .catch(requestError => setError(requestError.message));
  };

  const renderItem = ({item}) => (
    <TouchableOpacity style={[styles.item, !item.isRead && styles.unread]} onPress={() => readNotification(item)}>
      <View style={styles.icon}><Icon name="notifications" size={21} color="#E4002B" /></View>
      <View style={styles.body}>
        <View style={styles.titleRow}><Text style={styles.title}>{item.title}</Text>{!item.isRead && <View style={styles.dot} />}</View>
        <Text style={styles.message}>{item.body}</Text>
        <Text style={styles.time}>{item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Time unavailable'}</Text>
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back">
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerText}><Text style={styles.headerTitle}>Notifications</Text><Text style={styles.headerSubtitle}>ADMIN ALERTS</Text></View>
        <Text style={styles.count}>{notifications.filter(item => !item.isRead).length}</Text>
      </View>
      {loading ? <View style={styles.state}><ActivityIndicator color="#E4002B" /><Text style={styles.stateText}>Loading notifications...</Text></View> : null}
      {!loading && error && notifications.length === 0 ? <View style={styles.state}><Text style={styles.stateTitle}>Unable to load notifications</Text><Text style={styles.stateText}>{error}</Text></View> : null}
      {(!loading && !error) || notifications.length > 0 ? <FlatList data={notifications} renderItem={renderItem} keyExtractor={item => item._id || item.id} contentContainerStyle={styles.list} ListEmptyComponent={<View style={styles.state}><Text style={styles.stateTitle}>No notifications</Text><Text style={styles.stateText}>There are no alerts for this account.</Text></View>} /> : null}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F7F7F8'},
  header: {backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E8E8EB', flexDirection: 'row', alignItems: 'center'},
  backButton: {width: 42, height: 42, alignItems: 'center', justifyContent: 'center'},
  headerText: {flex: 1, marginLeft: 8},
  headerTitle: {fontSize: 22, fontWeight: '900', color: '#1A1A1A'},
  headerSubtitle: {fontSize: 8, fontWeight: '900', letterSpacing: 1, color: '#A1A1A6', marginTop: 4},
  count: {backgroundColor: '#E4002B', color: '#FFFFFF', minWidth: 30, padding: 7, textAlign: 'center', borderRadius: 15, fontWeight: '900'},
  list: {padding: 16, paddingBottom: 24},
  item: {backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ECECEF'},
  unread: {borderColor: '#F3B5BF'},
  icon: {width: 40, height: 40, borderRadius: 20, backgroundColor: '#FDE5E8', alignItems: 'center', justifyContent: 'center'},
  iconText: {color: '#E4002B', fontSize: 20, fontWeight: '900'},
  body: {flex: 1, marginHorizontal: 12},
  titleRow: {flexDirection: 'row', alignItems: 'center'},
  title: {fontSize: 15, fontWeight: '800', color: '#1A1A1A'},
  dot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#E4002B', marginLeft: 7},
  message: {fontSize: 13, color: '#59636E', marginTop: 5},
  time: {fontSize: 11, color: '#A1A1A6', marginTop: 7},
  arrow: {fontSize: 26, color: '#A1A1A6'},
  state: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  stateTitle: {fontSize: 17, fontWeight: '800', color: '#1A1A1A', textAlign: 'center'},
  stateText: {fontSize: 14, color: '#59636E', textAlign: 'center', marginTop: 8},
});

export default AdminNotificationScreen;
