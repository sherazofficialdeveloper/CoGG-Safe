// AdminSosScreen.js
import React, {useCallback, useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  AppState,
} from 'react-native';
import {deleteSos, deactivateSos, listSos} from '../../api/resources';
import Icon from '../../components/Icon';

const AdminSosScreen = ({
  onBack,
  onSosDetail,
  onProfile,
  token,
}) => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [sosAlerts, setSosAlerts] = useState([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const response = await listSos(token, {limit: 50});
      setSosAlerts((response?.sos || []).map(record => ({
        ...record,
        userName: record.userId?.username || 'CoGG Safe user',
        mobileNumber: record.userId?.mobileNumber || 'Mobile unavailable',
        initials: (record.userId?.username || 'CS').slice(0, 2).toUpperCase(),
        collectionName: record.collectionId?.name || 'Assigned collection',
        location: record.location?.latitude != null ? `${record.location.latitude.toFixed(5)}, ${record.location.longitude.toFixed(5)}` : 'Location unavailable',
        time: record.createdAt ? new Date(record.createdAt).toLocaleString() : 'Unknown time',
        status: record.status ? record.status.charAt(0).toUpperCase() + record.status.slice(1) : 'Pending',
        emergencyMessage: record.emergencyMessage || 'Emergency assistance requested.',
      })));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load SOS alerts.');
    }
  }, [token]);

  useEffect(() => {
    refresh().catch(() => undefined);
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') refresh().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refresh]);

  const runAdminAction = async (action, id) => {
    try {
      await action(token, id);
      await refresh();
    } catch (actionError) {
      setError(actionError.message || 'Unable to update this SOS.');
    }
  };

  const filters = ['All', 'Active', 'Resolved'];

  const filteredAlerts = sosAlerts.filter(alert => {
    const searchText = search.toLowerCase();
    const matchesSearch =
      alert.userName.toLowerCase().includes(searchText) ||
      alert.collectionName.toLowerCase().includes(searchText) ||
      alert.location.toLowerCase().includes(searchText);

    const matchesFilter =
      activeFilter === 'All' ? true : alert.status === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const getFilterCount = filter => {
    if (filter === 'All') {
      return sosAlerts.length;
    }
    return sosAlerts.filter(item => item.status === filter).length;
  };

  const activeCount = sosAlerts.filter(s => s.status === 'Active').length;
  const totalCount = sosAlerts.length;

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

          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>SOS Alerts</Text>
            <Text style={styles.headerSubtitle}>
              {activeCount} active · {totalCount} total recorded
            </Text>
          </View>

          {activeCount > 0 && (
            <View style={styles.activeAlarmBadge}>
              <View style={styles.activeAlarmDot} />
              <Text style={styles.activeAlarmText}>Active Alarm</Text>
            </View>
          )}
        </View>

        {/* ================= SEARCH ================= */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by worker, group, or address..."
            placeholderTextColor="#9CA3AF"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              activeOpacity={0.7}
              onPress={() => setSearch('')}>
              <Text style={styles.clearText}>×</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ================= FILTER TABS ================= */}
        <View style={styles.filterTabs}>
          {filters.map(filter => {
            const isActive = activeFilter === filter;
            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterTab,
                  isActive && styles.filterTabActive,
                  isActive && filter === 'Active' && styles.filterTabActiveRed,
                ]}
                activeOpacity={0.7}
                onPress={() => setActiveFilter(filter)}>
                <Text
                  style={[
                    styles.filterTabText,
                    isActive && styles.filterTabTextActive,
                  ]}>
                  {filter} ({getFilterCount(filter)})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ================= ALERTS LIST ================= */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}>

          {error ? <Text style={styles.emptyDescription}>{error}</Text> : null}
          {filteredAlerts.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Text style={styles.emptyIcon}>!</Text>
              </View>
              <Text style={styles.emptyTitle}>No alerts found</Text>
              <Text style={styles.emptyDescription}>
                No alerts found matching your filter.
              </Text>
            </View>
          ) : (
            filteredAlerts.map(alert => {
              const sosId = alert._id || alert.id;

              return (
                <TouchableOpacity
                  key={sosId || `${alert.userName}-${alert.time}`}
                  style={[
                    styles.alertCard,
                    alert.status === 'Active' && styles.activeCardBorder,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => onSosDetail?.(alert)}>

                {/* ===== HEADER ===== */}
                <View style={styles.alertHeader}>
                  <View style={styles.alertUser}>
                    <View
                      style={[
                        styles.alertAvatar,
                        {
                          backgroundColor:
                            alert.status === 'Active'
                              ? '#E4002B'
                              : '#178A4B',
                        },
                      ]}>
                      <Text style={styles.alertAvatarText}>
                        {alert.initials}
                      </Text>
                    </View>
                    <View style={styles.alertUserInfo}>
                      <Text style={styles.alertUserName}>
                        {alert.userName}
                      </Text>
                      <Text style={styles.alertCollectionName}>
                        {alert.collectionName}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.alertStatusBadge,
                      alert.status === 'Active'
                        ? styles.statusActive
                        : styles.statusResolved,
                    ]}>
                    <Text
                      style={[
                        styles.alertStatusText,
                        alert.status === 'Active'
                          ? styles.statusActiveText
                          : styles.statusResolvedText,
                      ]}>
                      {alert.status}
                    </Text>
                  </View>
                </View>

                {/* ===== EMERGENCY MESSAGE ===== */}
                <View style={styles.emergencyMessageBox}>
                  <Text style={styles.emergencyMessage} numberOfLines={2}>
                    "{alert.emergencyMessage}"
                  </Text>
                </View>

                {/* ===== LOCATION & TIME ===== */}
                <View style={styles.alertFooter}>
                  <View style={styles.alertLocation}>
                      <Icon name="location" size={18} color="#6B7280" />
                    <Text style={styles.locationText} numberOfLines={1}>
                      {alert.location}
                    </Text>
                  </View>
                  <Text style={styles.alertTime}>{alert.time}</Text>
                </View>

                {/* ===== VIEW TELEMETRY ===== */}
                <View style={styles.telemetryRow}>
                  <Text style={styles.telemetryText}>Review telemetry & voice relay</Text>
                  <Text style={styles.telemetryArrow}>›</Text>
                </View>
                <View style={styles.actionRow}>
                  {alert.status === 'Active' ? <>
                    <TouchableOpacity style={styles.deactivateButton} onPress={() => runAdminAction(deactivateSos, sosId)}><Text style={styles.actionText}>Deactivate</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.resolveButton} onPress={() => runAdminAction(deactivateSos, sosId)}><Text style={styles.resolveText}>Resolve</Text></TouchableOpacity>
                  </> : null}
                  <TouchableOpacity style={styles.deleteButton} onPress={() => {
                    Alert.alert('Delete SOS alert', 'This will permanently remove the SOS record from the admin list.', [
                      {text: 'Cancel', style: 'cancel'},
                      {text: 'Delete', style: 'destructive', onPress: () => runAdminAction(deleteSos, sosId)},
                    ]);
                  }}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity>
                </View>

              </TouchableOpacity>
              );
            })
          )}

          <View style={styles.bottomSpace} />
        </ScrollView>

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
    paddingBottom: 12,
    backgroundColor: '#F7F7F8',
  },

  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },

  backIcon: {
    fontSize: 32,
    lineHeight: 34,
    color: '#1A1A1A',
    fontWeight: '400',
    marginTop: -3,
  },

  headerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#6E6E73',
    marginTop: 2,
    fontWeight: '500',
  },

  activeAlarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDE7EA',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },

  activeAlarmDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E4002B',
    marginRight: 5,
  },

  activeAlarmText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
  },

  /* ================= SEARCH ================= */
  searchContainer: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E8',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },

  searchIcon: {
    color: '#9A9A9F',
    fontSize: 16,
    marginRight: 10,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    color: '#1A1A1A',
    fontSize: 12.5,
    fontWeight: '500',
  },

  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearText: {
    color: '#9A9A9F',
    fontSize: 16,
    fontWeight: '500',
  },

  /* ================= FILTER TABS ================= */
  filterTabs: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 20,
    marginBottom: 14,
  },

  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },

  filterTabActive: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },

  filterTabActiveRed: {
    backgroundColor: '#E4002B',
    borderColor: '#E4002B',
  },

  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6E6E73',
  },

  filterTabTextActive: {
    color: '#FFFFFF',
  },

  /* ================= ALERTS LIST ================= */
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },

  alertCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 3},
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },

  activeCardBorder: {
    borderColor: '#FFC7CC',
    backgroundColor: '#FFF9F9',
  },

  /* ===== ALERT HEADER ===== */
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },

  alertUser: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  alertAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  alertAvatarText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },

  alertUserInfo: {
    flex: 1,
  },

  alertUserName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  alertCollectionName: {
    fontSize: 11,
    color: '#6E6E73',
    marginTop: 1,
    fontWeight: '500',
  },

  alertStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginLeft: 6,
  },

  statusActive: {
    backgroundColor: '#FDE7EA',
  },

  statusResolved: {
    backgroundColor: '#E8F8EF',
  },

  alertStatusText: {
    fontSize: 9.5,
    fontWeight: '900',
  },

  statusActiveText: {
    color: '#E4002B',
  },

  statusResolvedText: {
    color: '#178A4B',
  },

  /* ===== EMERGENCY MESSAGE ===== */
  emergencyMessageBox: {
    backgroundColor: '#F9F9FA',
    borderWidth: 1,
    borderColor: '#EDEDEF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },

  emergencyMessage: {
    fontSize: 12,
    color: '#3A3A3C',
    lineHeight: 18,
    fontWeight: '500',
  },

  /* ===== LOCATION & TIME ===== */
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  alertLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },

  locationIcon: {
    fontSize: 12,
    marginRight: 4,
  },

  locationText: {
    fontSize: 10.5,
    color: '#6E6E73',
    fontWeight: '500',
    flex: 1,
  },

  alertTime: {
    fontSize: 10.5,
    color: '#6E6E73',
    fontWeight: '500',
    flexShrink: 0,
  },

  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },

  deactivateButton: {
    flex: 1,
    backgroundColor: '#FFF4E5',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },

  resolveButton: {
    flex: 1,
    backgroundColor: '#E8F8EF',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },

  deleteButton: {
    flex: 1,
    backgroundColor: '#FFF1F3',
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },

  actionText: {color: '#9A5B00', fontSize: 12, fontWeight: '800'},
  resolveText: {color: '#178A4B', fontSize: 12, fontWeight: '800'},
  deleteText: {color: '#B42318', fontSize: 12, fontWeight: '800'},

  /* ===== TELEMETRY ===== */
  telemetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EDEDEF',
  },

  telemetryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1A1A1A',
  },

  telemetryArrow: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '600',
  },

  /* ================= EMPTY STATE ================= */
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },

  emptyIconBox: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    fontSize: 26,
    color: '#9A9A9F',
    fontWeight: '900',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1A1A1A',
    marginTop: 14,
  },

  emptyDescription: {
    fontSize: 12,
    color: '#9A9A9F',
    marginTop: 6,
    textAlign: 'center',
  },

  bottomSpace: {
    height: 20,
  },
});

export default AdminSosScreen;