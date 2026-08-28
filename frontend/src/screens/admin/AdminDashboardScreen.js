// AdminDashboardScreen.js
import React, {useCallback, useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {listCollections, listSos, listUsers} from '../../api/resources';
import StatCard from '../../components/StatCard';
import Icon from '../../components/Icon';

const AdminDashboardScreen = ({
  onNavigate,
  onCollections,
  onUsers,
  onAddCollection,
  onSos,
  onNotifications,
  onProfile,
  onUserDetail,
  onSosDetail,
  user,
  token,
  onSwitchToUser,
}) => {
  const [collections, setCollections] = useState([]);
  const [totalCollections, setTotalCollections] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [activeUsers, setActiveUsers] = useState(0);
  const [inactiveUsers, setInactiveUsers] = useState(0);
  const [totalSos, setTotalSos] = useState(0);
  const [recentSos, setRecentSos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = useCallback(async (isMounted = () => true) => {
    setLoading(true);
    setError('');

    try {
      const [collectionResult, userResult, activeUserResult, inactiveUserResult, sosResult] = await Promise.all([
        listCollections(token),
        listUsers(token, {limit: 1}),
        listUsers(token, {limit: 1, status: 'active'}),
        listUsers(token, {limit: 1, status: 'inactive'}),
        listSos(token, {limit: 1}),
      ]);
      if (!isMounted()) return;
      setCollections(collectionResult.collections || []);
      setTotalCollections(collectionResult.meta?.total ?? (collectionResult.collections || []).length);
      setTotalUsers(userResult.meta?.total ?? 0);
      setActiveUsers(activeUserResult.meta?.total ?? 0);
      setInactiveUsers(inactiveUserResult.meta?.total ?? 0);
      setTotalSos(sosResult.meta?.total ?? 0);
      setRecentSos(sosResult.sos || []);
    } catch (requestError) {
      if (isMounted()) setError(requestError.message || 'Unable to load the admin overview.');
    } finally {
      if (isMounted()) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    loadDashboard(() => mounted);
    return () => { mounted = false; };
  }, [loadDashboard]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <View style={styles.container}>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}>

          {/* ================= ACTIVE SOS ================= */}
          {/* ================= DASHBOARD TITLE ================= */}
          <View style={styles.dashboardIntro}>
            <Text style={styles.dashboardTitle}>
              Safety Overview
            </Text>

            <Text style={styles.dashboardSubtitle}>
              Monitor your users, groups and emergency activity.
            </Text>
          </View>

          {loading ? <Text style={styles.sectionSubtitle}>Loading live overview...</Text> : null}
          {error ? (
            <View style={styles.errorState}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadDashboard()}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* ================= STATS ================= */}
          <View style={styles.statsGrid}>
            <StatCard title="Total users" value={totalUsers} icon="user" loading={loading} onPress={onUsers} />
            <StatCard title="Collections" value={totalCollections} icon="collection" loading={loading} onPress={onCollections} />
            <StatCard title="Active users" value={activeUsers} icon="user" tone="success" loading={loading} onPress={onUsers} />
            <StatCard title="Inactive users" value={inactiveUsers} icon="user" tone="muted" loading={loading} onPress={onUsers} />
            <StatCard title="SOS alerts" value={totalSos} icon="sos" tone="danger" loading={loading} onPress={onSos} />
          </View>

          {/* ================= QUICK ACTIONS ================= */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Quick Actions
            </Text>

            <Text style={styles.sectionSubtitle}>
              Manage safety operations
            </Text>
          </View>

          <View style={styles.quickActionsGrid}>

            <TouchableOpacity
              style={styles.quickAction}
              activeOpacity={0.75}
              onPress={onAddCollection}>

              <View style={styles.quickActionIcon}>
                <Icon name="add" size={24} color="#111827" />
              </View>

              <Text style={styles.quickActionText}>
                Add Group
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.quickAction}
              activeOpacity={0.75}
              onPress={onCollections}>

              <View style={styles.quickActionIcon}>
                <Icon name="collection" size={24} color="#111827" />
              </View>

              <Text style={styles.quickActionText}>
                Collections
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickAction, styles.quickActionSos]}
              activeOpacity={0.75}
              onPress={onSos}>

              <View
                style={[
                  styles.quickActionIcon,
                  styles.quickActionIconSos,
                ]}>
                <Icon name="sos" size={24} color="#E4002B" />
              </View>

              <Text
                style={[
                  styles.quickActionText,
                  styles.quickActionTextSos,
                ]}>
                SOS Alerts
              </Text>
            </TouchableOpacity>

          </View>

          {/* ================= COLLECTIONS ================= */}
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Collections
              </Text>

              <Text style={styles.sectionSubtitle}>
                {loading ? 'Loading collections...' : `${totalCollections} collections in the database`}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onCollections}
              activeOpacity={0.7}>
              <Text style={styles.viewAllText}>
                View all
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.collectionsList}>
            {!loading && !error && collections.length === 0 ? (
              <Text style={styles.emptyText}>No collections have been created yet.</Text>
            ) : collections.map((col, index) => (
              <TouchableOpacity
                key={col._id || col.id}
                style={[
                  styles.collectionCard,
                  index === collections.length - 1 &&
                    styles.collectionCardLast,
                ]}
                activeOpacity={0.75}
                onPress={onCollections}>

                <View style={styles.collectionLeft}>

                  <View
                    style={[
                      styles.collectionAvatar,
                      styles.collectionAvatarBlue,
                    ]}>
                    <Icon name="collection" size={22} color="#1A5FB4" />
                  </View>

                  <View style={styles.collectionInfo}>
                    <Text style={styles.collectionName}>
                      {col.name}
                    </Text>

                    <Text style={styles.collectionSubtitle}>
                      {col.type}
                    </Text>

                    <Text style={styles.collectionPhone}>
                      {col.emergencyCallNumber || 'Emergency number not configured'}
                    </Text>
                  </View>

                </View>

                <View style={styles.collectionRight}>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>Collection</Text>
                  </View>

                  <Text style={styles.chevron}>›</Text>
                </View>

              </TouchableOpacity>
            ))}
          </View>

          {/* ================= RECENT SOS ================= */}
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.sectionTitle}>
                Recent SOS Activity
              </Text>

              <Text style={styles.sectionSubtitle}>
                Latest emergency updates
              </Text>
            </View>

            <TouchableOpacity
              onPress={onSos}
              activeOpacity={0.7}>
              <Text style={styles.viewAllText}>
                See logs
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.sosList}>
            {recentSos.length === 0 ? (
              <Text style={styles.emptyText}>No SOS activity to display.</Text>
            ) : recentSos.map((item, index) => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.sosItem,
                  index === recentSos.length - 1 &&
                    styles.sosItemLast,
                ]}
                activeOpacity={0.75}
                onPress={onSosDetail}>

                <View style={styles.sosItemLeft}>

                  <View
                    style={[
                      styles.sosAvatar,
                      item.status === 'Active'
                        ? styles.sosAvatarActive
                        : styles.sosAvatarResolved,
                    ]}>

                    <Text style={styles.sosAvatarText}>
                      {item.initials}
                    </Text>
                  </View>

                  <View style={styles.sosItemInfo}>
                    <Text style={styles.sosItemName}>
                      {item.userName}
                    </Text>

                    <Text style={styles.sosItemSubtitle}>
                      {item.collectionName}
                    </Text>

                    <Text style={styles.sosItemTime}>
                      {item.time}
                    </Text>
                  </View>

                </View>

                <View
                  style={[
                    styles.sosStatusBadge,
                    item.status === 'Active'
                      ? styles.sosStatusActiveBadge
                      : styles.sosStatusResolvedBadge,
                  ]}>

                  <Text
                    style={[
                      styles.sosStatusText,
                      item.status === 'Active'
                        ? styles.sosStatusActive
                        : styles.sosStatusResolved,
                    ]}>
                    {item.status}
                  </Text>
                </View>

              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.bottomSpace} />

        </ScrollView>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 16,
  },

  emptyText: {
    color: '#6B7280',
    fontSize: 13,
    padding: 18,
    textAlign: 'center',
  },

  container: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 45,
  },

  /* ================= ACTIVE BANNER ================= */

  activeBanner: {
    backgroundColor: '#FFF5F6',
    borderWidth: 1.5,
    borderColor: '#FFD4DA',

    borderRadius: 22,
    padding: 17,

    flexDirection: 'row',
    alignItems: 'center',

    marginBottom: 22,

    shadowColor: '#E4002B',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },

  bannerIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,

    backgroundColor: '#E4002B',

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 14,
  },

  bannerIconText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '900',
  },

  bannerContent: {
    flex: 1,
  },

  bannerEyebrow: {
    fontSize: 9,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1.2,
    marginBottom: 4,
  },

  bannerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#B42318',
  },

  bannerSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '600',
  },

  bannerArrow: {
    fontSize: 30,
    color: '#E4002B',
    marginLeft: 10,
  },

  /* ================= INTRO ================= */

  dashboardIntro: {
    marginBottom: 16,
  },

  dashboardTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },

  dashboardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 5,
  },

  /* ================= STATS ================= */

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 10,
    marginBottom: 28,
  },

  statCard: {
    flex: 1,
    minHeight: 105,

    backgroundColor: '#FFFFFF',

    borderWidth: 1.5,
    borderColor: '#E4E7EB',

    borderRadius: 18,

    paddingVertical: 18,
    paddingHorizontal: 4,

    alignItems: 'center',
    justifyContent: 'center',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  statNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },

  statGreen: {
    color: '#168A4B',
  },

  statRed: {
    color: '#E4002B',
  },

  statLabel: {
    fontSize: 9,
    color: '#8B919B',
    letterSpacing: 0.8,
    marginTop: 7,
    fontWeight: '900',
    textAlign: 'center',
  },

  /* ================= SECTION HEADERS ================= */

  sectionHeader: {
    marginBottom: 12,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
  },

  sectionSubtitle: {
    fontSize: 12,
    color: '#7A818C',
    marginTop: 4,
    fontWeight: '600',
  },

  /* ================= QUICK ACTIONS ================= */

  quickActionsGrid: {
    flexDirection: 'row',
    gap: 11,
    marginBottom: 30,
  },

  quickAction: {
    flex: 1,
    minHeight: 125,

    backgroundColor: '#FFFFFF',

    borderWidth: 1.5,
    borderColor: '#E4E7EB',

    borderRadius: 20,

    alignItems: 'center',
    justifyContent: 'center',

    paddingHorizontal: 8,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  quickActionSos: {
    backgroundColor: '#FFF8F9',
    borderColor: '#F5BBC5',
  },

  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,

    backgroundColor: '#F3F5F7',

    alignItems: 'center',
    justifyContent: 'center',

    marginBottom: 10,
  },

  quickActionIconSos: {
    backgroundColor: '#FDE7EA',
  },

  quickActionIconText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
  },

  quickActionIconTextSos: {
    color: '#E4002B',
  },

  quickActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },

  quickActionTextSos: {
    color: '#E4002B',
  },

  /* ================= LIST HEADER ================= */

  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    marginBottom: 13,
    marginTop: 4,
  },

  viewAllText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0066CC',
  },

  /* ================= COLLECTIONS ================= */

  collectionsList: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1.5,
    borderColor: '#E4E7EB',

    borderRadius: 20,

    overflow: 'hidden',

    marginBottom: 30,

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  collectionCard: {
    minHeight: 90,

    paddingHorizontal: 16,
    paddingVertical: 15,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F2',
  },

  collectionCardLast: {
    borderBottomWidth: 0,
  },

  collectionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 8,
  },

  collectionAvatar: {
    width: 54,
    height: 54,
    borderRadius: 17,

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 14,
  },

  collectionAvatarBlue: {
    backgroundColor: '#E8EEF7',
  },

  collectionAvatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },

  collectionInfo: {
    flex: 1,
  },

  collectionName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  collectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    fontWeight: '600',
  },

  collectionPhone: {
    fontSize: 11,
    color: '#9AA0AA',
    marginTop: 3,
    fontWeight: '600',
  },

  collectionRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  sosBadge: {
    backgroundColor: '#FDE7EA',

    paddingHorizontal: 10,
    paddingVertical: 6,

    borderRadius: 14,

    marginBottom: 4,
  },

  sosBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
  },

  categoryBadge: {
    backgroundColor: '#F3F5F7',

    paddingHorizontal: 10,
    paddingVertical: 6,

    borderRadius: 14,

    marginBottom: 3,
  },

  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#68707A',
  },

  chevron: {
    fontSize: 24,
    lineHeight: 24,
    color: '#B8BEC7',
    fontWeight: '700',
  },

  /* ================= SOS ACTIVITY ================= */

  sosList: {
    backgroundColor: '#FFFFFF',

    borderWidth: 1.5,
    borderColor: '#E4E7EB',

    borderRadius: 20,

    overflow: 'hidden',

    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  sosItem: {
    minHeight: 82,

    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    paddingHorizontal: 16,
    paddingVertical: 14,

    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F2',
  },

  sosItemLast: {
    borderBottomWidth: 0,
  },

  sosItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },

  sosAvatar: {
    width: 50,
    height: 50,
    borderRadius: 16,

    alignItems: 'center',
    justifyContent: 'center',

    marginRight: 13,
  },

  sosAvatarActive: {
    backgroundColor: '#E4002B',
  },

  sosAvatarResolved: {
    backgroundColor: '#178A4B',
  },

  sosAvatarText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },

  sosItemInfo: {
    flex: 1,
  },

  sosItemName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
  },

  sosItemSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 3,
    fontWeight: '600',
  },

  sosItemTime: {
    fontSize: 11,
    color: '#9AA0AA',
    marginTop: 2,
    fontWeight: '600',
  },

  sosStatusBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 14,
  },

  sosStatusActiveBadge: {
    backgroundColor: '#FDE7EA',
  },

  sosStatusResolvedBadge: {
    backgroundColor: '#E8F8EF',
  },

  sosStatusText: {
    fontSize: 10,
    fontWeight: '900',
  },

  sosStatusActive: {
    color: '#E4002B',
  },

  sosStatusResolved: {
    color: '#178A4B',
  },

  bottomSpace: {
    height: 30,
  },
});

export default AdminDashboardScreen;