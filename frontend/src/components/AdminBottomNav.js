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
      key: 'Collections',  // ✅ Changed from 'Users' to 'Collections'
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
              <View
                style={[
                  styles.iconContainer,
                  isActive && styles.activeIconContainer,
                  tab.key === 'SOS' &&
                    styles.sosIconContainer,
                  tab.key === 'SOS' &&
                    isActive &&
                    styles.activeSosIconContainer,
                ]}>
                <Text
                  style={[
                    styles.icon,
                    tab.key === 'SOS' &&
                      !isActive &&
                      styles.sosIcon,
                    tab.key === 'SOS' &&
                      isActive &&
                      styles.activeSosIcon,
                    tab.key !== 'SOS' &&
                      isActive &&
                      styles.activeIcon,
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
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 8,
  },

  navBar: {
    height: 76,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E2E6',
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',

    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 4,
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