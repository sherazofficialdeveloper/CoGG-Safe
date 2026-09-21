// AppHeader.js - No external dependency (uses emoji/icons)
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Image,
} from 'react-native';
import Icon from './Icon';

const AppHeader = ({
  showNotification = false,
  onNotification,
  notificationCount = 0,
  showLogout = false,
  onLogout,
  showProfile = false,
  onProfile,
  hideLogo = false,
}) => {
  const hasRightActions = showNotification || showLogout || showProfile;

  return (
    <View style={styles.header}>

      {/* ================= LOGO ================= */}
      <View style={styles.leftSection}>
        {!hideLogo && (
          <View style={styles.logoContainer}>
            <View style={styles.logoWrapper}>
              <Image source={require('../public/logo.png')} style={styles.logoImage} />
            </View>

            <View style={styles.logoTextContainer}>
              <Text style={styles.logoName}>CoGG</Text>
              <Text style={styles.logoSub}>SAFE</Text>
            </View>
          </View>
        )}
      </View>

      {/* ================= ACTIONS ================= */}
      <View style={styles.rightSection}>

        {/* NOTIFICATION */}
        {showNotification && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onNotification}
            activeOpacity={0.75}>
            <Icon name="notifications" size={22} color="#1A1A1A" />

            {notificationCount > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}

        {/* PROFILE */}
        {showProfile && (
          <TouchableOpacity
            style={styles.headerButton}
            onPress={onProfile}
            activeOpacity={0.75}>
            <Text style={styles.iconText}>👤</Text>
          </TouchableOpacity>
        )}

        {/* LOGOUT */}
        {showLogout && (
          <TouchableOpacity
            style={[styles.headerButton, styles.logoutButton]}
            onPress={onLogout}
            activeOpacity={0.75}>
            <Icon name="logout" size={22} color="#E4002B" style={styles.logoutIcon} />
          </TouchableOpacity>
        )}

      </View>

    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 14,
    paddingHorizontal: 20,
    paddingBottom: 14,

    backgroundColor: '#FFFFFF',

    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',

    elevation: 2,

    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 5,
  },

  leftSection: {
    flex: 1,
    justifyContent: 'center',
  },

  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  logoWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.2,
    shadowRadius: 7,
    elevation: 4,
  },

  logoText: {
    color: '#FFFFFF',
    fontSize: 22,
  },

  logoImage: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },

  logoTextContainer: {
    marginLeft: 10,
  },

  logoName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 22,
  },

  logoSub: {
    fontSize: 9,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1.6,
    marginTop: 1,
  },

  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },

  logoutButton: {
    backgroundColor: '#FFF1F3',
    borderColor: '#FFD7DE',
  },

  iconText: {
    fontSize: 22,
  },

  logoutIcon: {
    color: '#E4002B',
  },

  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '900',
  },
});

export default AppHeader;