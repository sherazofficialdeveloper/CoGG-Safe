// AdminBottomNav.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const AdminBottomNav = ({
  activeTab = 'Dashboard',
  onNavigate,
}) => {
  const tabs = [
    {
      key: 'Dashboard',
      label: 'Dashboard',
      icon: '⌂',
    },
    {
      key: 'Groups',
      label: 'Groups',
      icon: '◫',
    },
    {
      key: 'SOS',
      label: 'SOS',
      icon: '!',
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.navBar}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          const isSOS = tab.key === 'SOS';

          return (
            <TouchableOpacity
              key={tab.key}
              activeOpacity={0.7}
              style={styles.tab}
              onPress={() => {
                if (onNavigate) {
                  onNavigate(tab.key);
                }
              }}>
              {isActive ? <View style={styles.activeIndicator} /> : null}

              {/* ================= ICON CONTAINER ================= */}
              <View
                style={[
                  styles.iconContainer,
                  // ✅ Non-SOS active tabs (Dashboard, Groups) — pink background
                  isActive && !isSOS && styles.activeIconContainer,
                  // ✅ SOS inactive — pink background
                  isSOS && styles.sosIconContainer,
                  // ✅ SOS active — red background
                  isSOS && isActive && styles.activeSosIconContainer,
                ]}>
                <Text
                  style={[
                    styles.icon,
                    // ✅ Non-SOS active tabs (Dashboard, Groups) — red icon
                    isActive && !isSOS && styles.activeIcon,
                    // ✅ SOS inactive — red icon
                    isSOS && !isActive && styles.sosIcon,
                    // ✅ SOS active — white icon
                    isSOS && isActive && styles.activeSosIcon,
                  ]}>
                  {tab.icon}
                </Text>
              </View>

              <Text
                style={[
                  styles.label,
                  isActive && styles.activeLabel,
                ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
  },

  navBar: {
    height: 76,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 4,
  },

  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: 12,
    right: 12,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
    backgroundColor: '#E4002B',
  },

  iconContainer: {
    width: 48,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeIconContainer: {
    backgroundColor: '#FDE5E8',
  },

  sosIconContainer: {
    backgroundColor: '#FDE5E8',
  },

  activeSosIconContainer: {
    backgroundColor: '#E4002B',
  },

  icon: {
    color: '#A1A1A6',
    fontSize: 26,
    fontWeight: '600',
  },

  activeIcon: {
    color: '#E4002B',
    fontWeight: '900',
  },

  sosIcon: {
    color: '#E4002B',
    fontWeight: '900',
  },

  activeSosIcon: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

  label: {
    color: '#A1A1A6',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  activeLabel: {
    color: '#E4002B',
    fontWeight: '900',
    fontSize: 12,
  },
});

export default AdminBottomNav;