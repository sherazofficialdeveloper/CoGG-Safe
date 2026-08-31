import React, {useEffect, useMemo, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Alert,
} from 'react-native';
import Icon from '../components/Icon';
import {listNotifications, markNotificationRead} from '../api/resources';

const UserNotificationScreen = ({
  token,
  onBack,
  onNotificationDetail,
  onBadgeCountChange,
}) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState('All');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listNotifications(token)
      .then(result => mounted && setNotifications(result.notifications || []))
      .catch(requestError => mounted && setError(requestError.message))
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [token]);

  const unreadCount = useMemo(() => {
    return notifications.filter(item => !item.isRead).length;
  }, [notifications]);

  useEffect(() => {
    if (onBadgeCountChange) {
      onBadgeCountChange(unreadCount);
    }
  }, [unreadCount, onBadgeCountChange]);

  const filteredNotifications = useMemo(() => {
    if (filter === 'Unread') {
      return notifications.filter(item => !item.isRead);
    }

    return notifications;
  }, [filter, notifications]);

  const handleNotificationPress = notification => {
    const notificationId = notification._id || notification.id;
    markNotificationRead(token, notificationId).then(() => {
      setNotifications(prev => prev.map(item =>
        (item._id || item.id) === notificationId ? {...item, isRead: true} : item,
      ));
    }).catch(requestError => setError(requestError.message));

    if (onNotificationDetail) {
      onNotificationDetail(notification);
      return;
    }

    Alert.alert(notification.title, notification.body);
  };

  const getIconStyle = type => {
    switch (type) {
      case 'sos':
        return styles.sosIcon;
      case 'location':
        return styles.locationIconContainer;
      case 'contacts':
        return styles.contactsIconContainer;
      case 'resolved':
        return styles.resolvedIconContainer;
      default:
        return styles.systemIconContainer;
    }
  };

  const getIconTextStyle = type => {
    switch (type) {
      case 'sos':
        return styles.sosIconText;
      case 'location':
        return styles.locationIconText;
      case 'contacts':
        return styles.contactsIconText;
      case 'resolved':
        return styles.resolvedIconText;
      default:
        return styles.systemIconText;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F7F8"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>
            Notifications
          </Text>

          <Text style={styles.headerSubtitle}>
            {unreadCount > 0
              ? `${unreadCount} unread notifications`
              : 'You are all caught up'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.markReadButton}
          activeOpacity={0.8}
          onPress={() => {}}>
          <Icon name="notifications" size={21} color="#E4002B" />
          <Text style={styles.markReadText}>
            Read All
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {loading && <Text style={styles.sectionTitle}>Loading notifications...</Text>}
        {error && <Text style={styles.notificationMessage}>{error}</Text>}

        {/* Active SOS Banner */}
        {notifications.some(
          item => item.sosId && item.sosId.status === 'active',
        ) && (
          <View style={styles.activeSosBanner}>
            <View style={styles.activeSosLeft}>
              <View style={styles.activeSosIcon}>
                <Text style={styles.activeSosIconText}>!</Text>
              </View>

              <View style={styles.activeSosContent}>
                <Text style={styles.activeSosTitle}>
                  ACTIVE EMERGENCY SOS
                </Text>

                <Text style={styles.activeSosDescription}>
                  A team member currently has an active SOS alert.
                </Text>
              </View>
            </View>

            <View style={styles.liveContainer}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
        )}

        {/* Filters */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[
              styles.filterButton,
              filter === 'All' && styles.filterButtonActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setFilter('All')}>
            <Text
              style={[
                styles.filterText,
                filter === 'All' && styles.filterTextActive,
              ]}>
              All
            </Text>

            <View
              style={[
                styles.filterCount,
                filter === 'All' &&
                  styles.filterCountActive,
              ]}>
              <Text
                style={[
                  styles.filterCountText,
                  filter === 'All' &&
                    styles.filterCountTextActive,
                ]}>
                {notifications.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.filterButton,
              filter === 'Unread' &&
                styles.filterButtonActive,
            ]}
            activeOpacity={0.8}
            onPress={() => setFilter('Unread')}>
            <Text
              style={[
                styles.filterText,
                filter === 'Unread' &&
                  styles.filterTextActive,
              ]}>
              Unread
            </Text>

            {unreadCount > 0 && (
              <View
                style={[
                  styles.filterCount,
                  filter === 'Unread' &&
                    styles.filterCountActive,
                ]}>
                <Text
                  style={[
                    styles.filterCountText,
                    filter === 'Unread' &&
                      styles.filterCountTextActive,
                  ]}>
                  {unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {filter === 'Unread'
              ? 'UNREAD NOTIFICATIONS'
              : 'RECENT NOTIFICATIONS'}
          </Text>
        </View>

        {/* Notifications */}
        {filteredNotifications.map(notification => (
          <TouchableOpacity
            key={notification._id}
            style={[
              styles.notificationCard,
              !notification.isRead &&
                styles.notificationCardUnread,
            ]}
            activeOpacity={0.8}
            onPress={() =>
              handleNotificationPress(notification)
            }>

            {/* Unread Indicator */}
            {!notification.isRead && (
              <View style={styles.unreadIndicator} />
            )}

            {/* Icon */}
            <View
              style={[
                styles.iconContainer,
                getIconStyle(notification.sosId && notification.sosId.status === 'active' ? 'sos' : 'system'),
              ]}>
              <Text
                style={[
                  styles.notificationIconText,
                  getIconTextStyle(notification.type),
                ]}>
                <Icon name={notification.type === 'sos' ? 'sos' : 'notifications'} size={22} color="#FFFFFF" />
              </Text>
            </View>

            {/* Content */}
            <View style={styles.notificationContent}>
              <View style={styles.notificationTopRow}>
                <Text
                  style={[
                    styles.notificationTitle,
                    !notification.isRead &&
                      styles.notificationTitleUnread,
                  ]}
                  numberOfLines={1}>
                  {notification.title}
                </Text>

                <Text style={styles.notificationTime}>
                  {notification.createdAt ? new Date(notification.createdAt).toLocaleString() : 'Time unavailable'}
                </Text>
              </View>

              <Text
                style={styles.notificationMessage}
                numberOfLines={2}>
                {notification.body}
              </Text>

              {notification.sosId && notification.sosId.status === 'active' && (
                <View style={styles.activeAlertTag}>
                  <View style={styles.smallLiveDot} />

                  <Text style={styles.activeAlertTagText}>
                    ACTIVE ALERT
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}

        {/* Empty State */}
        {filteredNotifications.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>♧</Text>
            </View>

            <Text style={styles.emptyTitle}>
              No unread notifications
            </Text>

            <Text style={styles.emptyDescription}>
              You have read all your notifications.
            </Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footerInfo}>
          <Text style={styles.footerTitle}>
            Stay informed, stay safe
          </Text>

          <Text style={styles.footerDescription}>
            Important SOS and safety alerts will always appear here.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },

  header: {
    height: 68,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E9E9EC',
  },

  backButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
  },

  backIcon: {
    color: '#1A1A1A',
    fontSize: 38,
    lineHeight: 38,
    marginTop: -5,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '800',
  },

  headerSubtitle: {
    color: '#8B8B91',
    fontSize: 10,
    marginTop: 3,
  },

  markReadButton: {
    width: 62,
    height: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  markReadText: {
    color: '#E4002B',
    fontSize: 11,
    fontWeight: '800',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 35,
  },

  activeSosBanner: {
    backgroundColor: '#FFF0F2',
    borderWidth: 1,
    borderColor: '#FFC8CF',
    borderRadius: 15,
    padding: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  activeSosLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  activeSosIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  activeSosIconText: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
  },

  activeSosContent: {
    flex: 1,
  },

  activeSosTitle: {
    color: '#E4002B',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  activeSosDescription: {
    color: '#6E6E73',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 4,
  },

  liveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE1E5',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 10,
    marginLeft: 7,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 10,
    backgroundColor: '#E4002B',
    marginRight: 4,
  },

  liveText: {
    color: '#E4002B',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  filterContainer: {
    height: 45,
    backgroundColor: '#ECECEF',
    borderRadius: 12,
    padding: 4,
    marginTop: 18,
    flexDirection: 'row',
  },

  filterButton: {
    flex: 1,
    borderRadius: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },

  filterButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  filterText: {
    color: '#8B8B91',
    fontSize: 11,
    fontWeight: '700',
  },

  filterTextActive: {
    color: '#E4002B',
    fontWeight: '800',
  },

  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DADADD',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },

  filterCountActive: {
    backgroundColor: '#FDE4E8',
  },

  filterCountText: {
    color: '#6E6E73',
    fontSize: 8,
    fontWeight: '800',
  },

  filterCountTextActive: {
    color: '#E4002B',
  },

  sectionHeader: {
    marginTop: 24,
    marginBottom: 10,
  },

  sectionTitle: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  notificationCard: {
    minHeight: 90,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9E9EC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 9,
    flexDirection: 'row',
    alignItems: 'flex-start',
    position: 'relative',
  },

  notificationCardUnread: {
    borderColor: '#F5C9D0',
    backgroundColor: '#FFFDFD',
  },

  unreadIndicator: {
    position: 'absolute',
    top: 13,
    left: 5,
    width: 4,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#E4002B',
  },

  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginLeft: 3,
  },

  sosIcon: {
    backgroundColor: '#FDE4E8',
  },

  locationIconContainer: {
    backgroundColor: '#EAF3FF',
  },

  contactsIconContainer: {
    backgroundColor: '#FFF4DF',
  },

  resolvedIconContainer: {
    backgroundColor: '#EAF9F0',
  },

  systemIconContainer: {
    backgroundColor: '#F0F0F3',
  },

  notificationIconText: {
    fontSize: 20,
    fontWeight: '800',
  },

  sosIconText: {
    color: '#E4002B',
  },

  locationIconText: {
    color: '#2777D3',
  },

  contactsIconText: {
    color: '#D88900',
  },

  resolvedIconText: {
    color: '#22A06B',
  },

  systemIconText: {
    color: '#6E6E73',
  },

  notificationContent: {
    flex: 1,
    paddingRight: 4,
  },

  notificationTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },

  notificationTitle: {
    flex: 1,
    color: '#4D4D52',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },

  notificationTitleUnread: {
    color: '#1A1A1A',
    fontWeight: '800',
  },

  notificationTime: {
    color: '#A1A1A6',
    fontSize: 9,
  },

  notificationMessage: {
    color: '#8B8B91',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  activeAlertTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F2',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 7,
  },

  smallLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 10,
    backgroundColor: '#E4002B',
    marginRight: 4,
  },

  activeAlertTagText: {
    color: '#E4002B',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },

  chevron: {
    color: '#A1A1A6',
    fontSize: 24,
    marginTop: 5,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },

  emptyIconContainer: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EEEEF0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    color: '#A1A1A6',
    fontSize: 27,
  },

  emptyTitle: {
    color: '#4D4D52',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 13,
  },

  emptyDescription: {
    color: '#9A9A9F',
    fontSize: 11,
    marginTop: 5,
  },

  footerInfo: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E9E9EC',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
    marginTop: 16,
  },

  footerTitle: {
    color: '#4D4D52',
    fontSize: 12,
    fontWeight: '800',
  },

  footerDescription: {
    color: '#9A9A9F',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 6,
  },
});

export default UserNotificationScreen;