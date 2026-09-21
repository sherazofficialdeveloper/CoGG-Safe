// UserBottomNav.js - ADD HISTORY TAB

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from './Icon';

const UserBottomNav = ({
  activeTab = 'Home',
  onNavigate,
}) => {
  const tabs = [
    {
      key: 'Home',
      label: 'Home',
      icon: 'home-outline',
    },
    {
      key: 'Contacts',
      label: 'Contacts',
      icon: 'account-group-outline',
    },
    {
      key: 'History',  // ✅ NEW: History tab added
      label: 'History',
      icon: 'clipboard-text-outline',
    },
    {
      key: 'Profile',
      label: 'Profile',
      icon: 'account-outline',
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
              {isActive ? <View style={styles.activeIndicator} /> : null}
              <View
                style={[
                  styles.iconContainer,
                  isActive && styles.activeIconContainer,
                ]}>
                <Icon
                  name={tab.icon}
                  size={26}
                  color={isActive ? '#E4002B' : '#A1A1A6'}
                />
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

  icon: {
    color: '#A1A1A6',
    fontSize: 26,
    fontWeight: '600',
  },

  activeIcon: {
    color: '#E4002B',
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

export default UserBottomNav;