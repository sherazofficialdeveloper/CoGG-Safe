// UserHistoryScreen.js - COMPLETE FIXED
import React, {useEffect, useState, useCallback} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import {listSos} from '../api/resources';
import {getCachedApiData} from '../api/client';
import Icon from '../components/Icon';

const UserHistoryScreen = ({token, onBack, onHistoryDetail}) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  // ================= Load History =================
  const loadHistory = useCallback(async (forceRefresh = false) => {
    if (!token) return;
    
    try {
      setError('');
      const cached = getCachedApiData('/sos', token);
      if (cached?.sos && !forceRefresh) {
        setRecords(cached.sos);
        setLoading(false);
      }
      
      const result = await listSos(token, {limit: 100}, {forceRefresh});
      if (result?.sos) {
        setRecords(result.sos);
      }
    } catch (err) {
      setError(err.message || 'Unable to load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    loadHistory(true);
  }, [loadHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory(true);
  };

  // ================= Filters =================
  const getFilteredRecords = () => {
    if (filter === 'all') return records;
    return records.filter(item => item.status === filter);
  };

  // ================= Status Helpers =================
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return '#E4002B';
      case 'cancelled': return '#F59E0B';
      case 'deactivated': return '#178A4B';
      default: return '#6B7280';
    }
  };

  const getStatusLabel = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'ACTIVE';
      case 'cancelled': return 'CANCELLED';
      case 'deactivated': return 'RESOLVED';
      default: return status?.toUpperCase() || 'UNKNOWN';
    }
  };

  // ================= Handle Card Press =================
  const handleCardPress = (item) => {
    // ================= FIX: Pass the full SOS object to parent =================
    if (onHistoryDetail) {
      onHistoryDetail(item);
    }
  };

  const filteredRecords = getFilteredRecords();
  const activeCount = records.filter(r => r.status === 'active').length;
  const totalCount = records.length;

  // ================= Loading State =================
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />
      {loading ? <View style={styles.topLoading}><ActivityIndicator size="small" color="#E4002B" /><Text style={styles.topLoadingText}>Refreshing latest data...</Text></View> : null}

      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Icon name="back" size={22} color="#1A1A1A" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>SOS History</Text>
          <Text style={styles.headerSubtitle}>{totalCount} records</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      {/* ================= STATS ================= */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalCount}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statCard, styles.statActive]}>
          <Text style={[styles.statNumber, styles.statActiveNumber]}>{activeCount}</Text>
          <Text style={[styles.statLabel, styles.statActiveLabel]}>Active</Text>
        </View>
        <View style={[styles.statCard, styles.statResolved]}>
          <Text style={[styles.statNumber, styles.statResolvedNumber]}>{totalCount - activeCount}</Text>
          <Text style={[styles.statLabel, styles.statResolvedLabel]}>Resolved</Text>
        </View>
      </View>

      {/* ================= FILTERS ================= */}
      <View style={styles.filterContainer}>
        {['all', 'active', 'cancelled', 'deactivated'].map((filterType) => (
          <TouchableOpacity
            key={filterType}
            style={[
              styles.filterButton,
              filter === filterType && styles.filterButtonActive,
            ]}
            onPress={() => setFilter(filterType)}
          >
            <Text style={[
              styles.filterText,
              filter === filterType && styles.filterTextActive,
            ]}>
              {filterType.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ================= LIST ================= */}
      <ScrollView
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#E4002B']} />
        }
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Unable to load history</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => loadHistory(true)}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : filteredRecords.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={styles.emptyIconContainer}>
              <Text style={styles.emptyIcon}>📋</Text>
            </View>
            <Text style={styles.emptyTitle}>No SOS history</Text>
            <Text style={styles.emptyText}>
              {filter === 'all' 
                ? 'You haven\'t triggered any SOS alerts yet.'
                : `No ${filter} SOS records found.`}
            </Text>
          </View>
        ) : (
          filteredRecords.map((item) => (
            <TouchableOpacity
              key={item._id || item.id}
              style={styles.historyCard}
              activeOpacity={0.8}
              onPress={() => handleCardPress(item)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardLeft}>
                  <View style={[styles.statusDot, {backgroundColor: getStatusColor(item.status)}]} />
                  <Text style={styles.cardStatus}>{getStatusLabel(item.status)}</Text>
                </View>
                <Text style={styles.cardTime}>
                  {item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown'}
                </Text>
              </View>

              <Text style={styles.cardMessage} numberOfLines={2}>
                {item.emergencyMessage || 'Emergency SOS triggered'}
              </Text>

              <View style={styles.cardFooter}>
                <View style={styles.cardLocation}>
                  <Text style={styles.cardLocationIcon}>📍</Text>
                  <Text style={styles.cardLocationText} numberOfLines={1}>
                    {item.location?.latitude != null && item.location?.longitude != null
                      ? `${Number(item.location.latitude).toFixed(4)}, ${Number(item.location.longitude).toFixed(4)}`
                      : 'Location unknown'}
                  </Text>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
        <View style={styles.bottomSpace} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F7F7F8' },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topLoading: {height: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF0F2'},
  topLoadingText: {marginLeft: 8, fontSize: 12, color: '#E4002B', fontWeight: '600'},
  loadingText: { marginTop: 16, fontSize: 14, color: '#6B7280', fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEF0',
  },

  backButton: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#1A1A1A' },
  headerSubtitle: { fontSize: 11, color: '#6E6E73', marginTop: 2 },
  headerRight: { width: 40 },

  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8E8EB',
  },

  statActive: { borderColor: '#FDE7EA', backgroundColor: '#FFF5F6' },
  statResolved: { borderColor: '#E8F8EF', backgroundColor: '#F5FDF8' },

  statNumber: { fontSize: 20, fontWeight: '900', color: '#1A1A1A' },
  statActiveNumber: { color: '#E4002B' },
  statResolvedNumber: { color: '#178A4B' },

  statLabel: { fontSize: 10, fontWeight: '700', color: '#6E6E73', marginTop: 4 },
  statActiveLabel: { color: '#E4002B' },
  statResolvedLabel: { color: '#178A4B' },

  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },

  filterButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F2F4',
    borderWidth: 1,
    borderColor: 'transparent',
  },

  filterButtonActive: {
    backgroundColor: '#E4002B',
    borderColor: '#E4002B',
  },

  filterText: { fontSize: 10, fontWeight: '700', color: '#6E6E73' },
  filterTextActive: { color: '#FFFFFF' },

  listContent: { padding: 16, paddingBottom: 30 },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8E8EB',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLeft: { flexDirection: 'row', alignItems: 'center' },

  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  cardStatus: { fontSize: 11, fontWeight: '800', color: '#1A1A1A' },
  cardTime: { fontSize: 10, color: '#A1A1A6' },

  cardMessage: { fontSize: 14, fontWeight: '600', color: '#1A1A1A', marginTop: 8, lineHeight: 20 },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  cardLocation: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  cardLocationIcon: { fontSize: 12, marginRight: 6 },
  cardLocationText: { fontSize: 11, color: '#6E6E73', flex: 1 },
  cardArrow: { fontSize: 20, color: '#A1A1A6' },

  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F2F4', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyIcon: { fontSize: 30 },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: '#1A1A1A' },
  emptyText: { fontSize: 13, color: '#6E6E73', marginTop: 6, textAlign: 'center' },

  retryButton: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20, backgroundColor: '#E4002B' },
  retryButtonText: { color: '#FFFFFF', fontWeight: '700' },

  bottomSpace: { height: 20 },
});

export default UserHistoryScreen;