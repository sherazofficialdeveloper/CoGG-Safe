// UserBottomNav.js
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

const UserBottomNav = ({
  activeTab = 'Home',
  onNavigate,
}) => {
  const tabs = [
    {
      key: 'Home',
      label: 'Home',
      icon: '🏠',
    },
    {
      key: 'Contacts',
      label: 'Contacts',
      icon: '👥',
    },
    {
      key: 'Profile',
      label: 'Profile',
      icon: '👤',
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
                ]}>
                <Text
                  style={[
                    styles.icon,
                    isActive && styles.activeIcon,
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