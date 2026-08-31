// AdminHeader.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from './Icon';

const AdminHeader = ({
  user,
  onNotifications,
  onLogout,
  activeSosCount = 0,
  onSwitchToUser,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, {paddingTop: insets.top + 10}]}>

      {/* ================= LEFT ================= */}
      <View style={styles.leftSection}>
        <Text style={styles.appEyebrow}>ADMIN CONTROL CENTER</Text>

        <Text style={styles.appTitle}>CoGG Safe Admin</Text>

        <View style={styles.adminInfoRow}>
          <View style={styles.adminOnlineDot} />

          <Text style={styles.appSubtitle}>
            {user?.username || 'admin123'} · Safety Operations
          </Text>
        </View>
      </View>

      {/* ================= RIGHT ================= */}
      <View style={styles.rightSection}>

        {/* NOTIFICATION */}
        <TouchableOpacity
          style={styles.headerButton}
          onPress={onSwitchToUser}
          activeOpacity={0.75}
          accessibilityLabel="Switch to User">
          <Text style={styles.switchText}>USER</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerButton}
          onPress={onNotifications}
          activeOpacity={0.75}>
          <Text style={styles.iconText}>🔔</Text>

          {activeSosCount > 0 && (
            <View style={styles.notificationBadge}>
              <Text style={styles.notificationBadgeText}>
                {activeSosCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* LOGOUT */}
        <TouchableOpacity
          style={[styles.headerButton, styles.logoutButton]}
          onPress={onLogout}
          activeOpacity={0.75}>
          <Icon name="logout" size={22} color="#E4002B" style={styles.logoutIcon} />
        </TouchableOpacity>

      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 20,

    backgroundColor: '#FFFFFF',

    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF1',

    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  leftSection: {
    flex: 1,
    paddingRight: 12,
  },

  appEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1.3,
    marginBottom: 5,
  },

  appTitle: {
    fontSize: 25,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: -0.5,
  },

  adminInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },

  adminOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 6,
  },

  appSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },

  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  headerButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },

  logoutButton: {
    backgroundColor: '#FFF7F8',
    borderColor: '#FFD7DE',
  },

  logoutIcon: {
    marginTop: 1,
  },

  switchText: {
    color: '#E4002B',
    fontSize: 10,
    fontWeight: '900',
  },

  notificationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});

export default AdminHeader;