// AppShell.js
import React from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';

import AppHeader from './AppHeader';

const AppShell = ({
  children,
  backgroundColor = '#F7F8FA',
  statusBarColor = '#FFFFFF',
  barStyle = 'dark-content',

  // ============ HEADER PROPS ============
  showNotification = false,
  onNotification,
  notificationCount = 0,
  showLogout = false,
  onLogout,
  showProfile = false,
  onProfile,
  hideLogo = false,
  hideHeader = false,

  // ============ BOTTOM NAV PROPS ============
  bottomNav = null,

  // ============ CONTENT ============
  contentStyle,
}) => {
  return (
    <SafeAreaView style={[styles.safeArea, {backgroundColor}]}>
      <StatusBar
        barStyle={barStyle}
        backgroundColor={statusBarColor}
        translucent={false}
      />

      <View style={[styles.container, {backgroundColor}]}>

        {/* ========== HEADER ========== */}
        {!hideHeader && (
          <AppHeader
            showNotification={showNotification}
            onNotification={onNotification}
            notificationCount={notificationCount}
            showLogout={showLogout}
            onLogout={onLogout}
            showProfile={showProfile}
            onProfile={onProfile}
            hideLogo={hideLogo}
          />
        )}

        {/* ========== CONTENT ========== */}
        <View style={[styles.content, contentStyle]}>
          {children}
        </View>

        {/* ========== BOTTOM NAV ========== */}
        {bottomNav && (
          <View style={styles.bottomNavContainer}>
            {bottomNav}
          </View>
        )}

      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },

  container: {
    flex: 1,
  },

  content: {
    flex: 1,
  },

  bottomNavContainer: {
    width: '100%',
  },
});

export default AppShell;