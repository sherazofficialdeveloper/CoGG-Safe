// AdminProfileScreen.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';

const AdminProfileScreen = ({
  user,
  onLogout,
  onBack,
}) => {
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F7F8"
        translucent={false}
      />

      <View style={styles.container}>

        {/* ================= HEADER ================= */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={onBack}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Admin Profile</Text>
            <Text style={styles.headerSubtitle}>ADMIN ACCOUNT</Text>
          </View>

          <View style={styles.headerRight} />
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>

          {/* ================= PROFILE CARD ================= */}
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(user?.username || 'A').slice(0, 2).toUpperCase()}
              </Text>
            </View>

            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>
                {user?.username || 'Administrator'}
              </Text>
              <Text style={styles.profileRole}>System Administrator</Text>
              <Text style={styles.profileEmail}>
                {user?.email || 'admin@cogg.com'}
              </Text>
            </View>
          </View>

          {/* ================= ACCOUNT DETAILS ================= */}
          <Text style={styles.sectionTitle}>ACCOUNT DETAILS</Text>

          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoIconText}>👤</Text>
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Account Name</Text>
                <Text style={styles.infoValue}>
                  {user?.username || 'Administrator'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoIconText}>✉</Text>
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Email Address</Text>
                <Text style={styles.infoValue}>
                  {user?.email || 'admin@cogg.com'}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoIconText}>🔑</Text>
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Account Role</Text>
                <Text style={styles.infoValue}>Administrator</Text>
              </View>
            </View>
          </View>

          {/* ================= SECURITY ================= */}
          <Text style={styles.sectionTitle}>SECURITY</Text>

          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.actionCard}
            onPress={() => {}}>
            <View style={styles.actionIcon}>
              <Text style={styles.actionIconText}>🔒</Text>
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Change Password</Text>
              <Text style={styles.actionSubtitle}>Update your account password</Text>
            </View>
            <Text style={styles.actionArrow}>›</Text>
          </TouchableOpacity>

          {/* ================= LOGOUT ================= */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.logoutButton}
            onPress={handleLogout}>
            <Text style={styles.logoutText}>🚪 Log Out</Text>
          </TouchableOpacity>

          <View style={styles.bottomSpace} />

        </ScrollView>

        {/* ✅ BottomNav REMOVED - Will be handled by App.js */}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },

  container: {
    flex: 1,
    backgroundColor: '#F7F7F8',
  },

  /* ================= HEADER ================= */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) + 8 : 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEF0',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  backIcon: {
    fontSize: 32,
    color: '#1A1A1A',
    fontWeight: '300',
    marginTop: -3,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  headerSubtitle: {
    fontSize: 9,
    fontWeight: '900',
    color: '#A1A1A6',
    letterSpacing: 1.2,
    marginTop: 4,
  },

  headerRight: {
    width: 42,
  },

  /* ================= SCROLL ================= */
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },

  /* ================= PROFILE CARD ================= */
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9E9EC',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FDE5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  avatarText: {
    color: '#E4002B',
    fontSize: 28,
    fontWeight: '900',
  },

  profileInfo: {
    flex: 1,
  },

  profileName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  profileRole: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E4002B',
    marginTop: 4,
  },

  profileEmail: {
    fontSize: 12,
    color: '#8B8B91',
    marginTop: 5,
    fontWeight: '500',
  },

  /* ================= SECTION ================= */
  sectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#8B8B91',
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  /* ================= INFO CARD ================= */
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E9E9EC',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  infoRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
  },

  infoIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  infoIconText: {
    fontSize: 20,
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A1A1A6',
    letterSpacing: 0.6,
  },

  infoValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEEEF0',
  },

  /* ================= ACTION CARD ================= */
  actionCard: {
    minHeight: 74,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E9E9EC',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },

  actionIconText: {
    fontSize: 20,
  },

  actionContent: {
    flex: 1,
  },

  actionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
  },

  actionSubtitle: {
    fontSize: 11,
    color: '#8B8B91',
    marginTop: 3,
    fontWeight: '500',
  },

  actionArrow: {
    fontSize: 26,
    color: '#C8C8CD',
    fontWeight: '300',
  },

  /* ================= LOGOUT ================= */
  logoutButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#FFD5DA',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },

  logoutText: {
    color: '#E4002B',
    fontSize: 15,
    fontWeight: '800',
  },

  bottomSpace: {
    height: 20,
  },
});

export default AdminProfileScreen;
