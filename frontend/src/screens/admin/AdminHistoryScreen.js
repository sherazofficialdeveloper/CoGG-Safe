import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
  TextInput,
} from 'react-native';

const AdminHistoryScreen = ({
  onBack,
  onSosDetail,
}) => {
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState('All');

  const historyData = [
    {
      id: 101,
      userName: 'Sheraz Ali',
      initials: 'SA',
      location: 'Blue Area, Islamabad',
      date: 'August 24, 2026',
      time: '10:42 AM',
      status: 'Resolved',
      duration: '18 min',
      priority: 'High',
      color: '#E4002B',
    },
    {
      id: 102,
      userName: 'Ali Shah',
      initials: 'AS',
      location: 'F-7 Markaz, Islamabad',
      date: 'August 24, 2026',
      time: '09:15 AM',
      status: 'Resolved',
      duration: '12 min',
      priority: 'High',
      color: '#2777D3',
    },
    {
      id: 103,
      userName: 'Waqas Bashir',
      initials: 'WB',
      location: 'G-11, Islamabad',
      date: 'August 23, 2026',
      time: '08:35 PM',
      status: 'Resolved',
      duration: '8 min',
      priority: 'Normal',
      color: '#D88900',
    },
    {
      id: 104,
      userName: 'Noman Khan',
      initials: 'NK',
      location: 'F-6, Islamabad',
      date: 'August 23, 2026',
      time: '05:20 PM',
      status: 'Cancelled',
      duration: '3 min',
      priority: 'Normal',
      color: '#5B67D8',
    },
    {
      id: 105,
      userName: 'Hamza Ahmed',
      initials: 'HA',
      location: 'I-8 Markaz, Islamabad',
      date: 'August 22, 2026',
      time: '11:10 PM',
      status: 'Resolved',
      duration: '21 min',
      priority: 'High',
      color: '#22A06B',
    },
    {
      id: 106,
      userName: 'Ahmed Khan',
      initials: 'AK',
      location: 'G-9 Markaz, Islamabad',
      date: 'August 22, 2026',
      time: '04:42 PM',
      status: 'Cancelled',
      duration: '2 min',
      priority: 'Normal',
      color: '#7656D6',
    },
    {
      id: 107,
      userName: 'Usman Tariq',
      initials: 'UT',
      location: 'F-10 Markaz, Islamabad',
      date: 'August 21, 2026',
      time: '07:25 PM',
      status: 'Resolved',
      duration: '15 min',
      priority: 'High',
      color: '#E26D5A',
    },
    {
      id: 108,
      userName: 'Bilal Ahmed',
      initials: 'BA',
      location: 'G-8, Islamabad',
      date: 'August 21, 2026',
      time: '02:10 PM',
      status: 'Resolved',
      duration: '9 min',
      priority: 'Normal',
      color: '#22A6B3',
    },
  ];

  const filters = [
    'All',
    'Resolved',
    'Cancelled',
  ];

  const filteredHistory = historyData.filter(item => {
      const searchText = search.toLowerCase();

      const matchesSearch =
        item.userName
          .toLowerCase()
          .includes(searchText) ||
        item.location
          .toLowerCase()
          .includes(searchText) ||
        item.id
          .toString()
          .includes(searchText);

      const matchesFilter =
        selectedFilter === 'All'
          ? true
          : item.status === selectedFilter;

      return matchesSearch && matchesFilter;
  });

  const getFilterCount = filter => {
    if (filter === 'All') {
      return historyData.length;
    }

    return historyData.filter(
      item => item.status === filter,
    ).length;
  };

  const getStatusStyles = status => {
    if (status === 'Resolved') {
      return {
        badge: styles.resolvedBadge,
        dot: styles.resolvedDot,
        text: styles.resolvedText,
      };
    }

    return {
      badge: styles.cancelledBadge,
      dot: styles.cancelledDot,
      text: styles.cancelledText,
    };
  };

  const totalResolved = historyData.filter(
    item => item.status === 'Resolved',
  ).length;

  const totalCancelled = historyData.filter(
    item => item.status === 'Cancelled',
  ).length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F7F7F8"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          activeOpacity={0.8}
          onPress={onBack}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            SOS History
          </Text>

          <Text style={styles.headerSubtitle}>
            EMERGENCY RECORDS
          </Text>
        </View>

        <View style={styles.headerRight}>
          <Text style={styles.headerCount}>
            {historyData.length}
          </Text>
        </View>
      </View>

      <View style={styles.container}>
        {/* Statistics */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <View style={styles.statTopRow}>
              <View style={styles.statIconBox}>
                <Text style={styles.statIcon}>
                  ✓
                </Text>
              </View>

              <Text style={styles.statNumber}>
                {totalResolved}
              </Text>
            </View>

            <Text style={styles.statLabel}>
              RESOLVED ALERTS
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statTopRow}>
              <View
                style={[
                  styles.statIconBox,
                  styles.cancelIconBox,
                ]}>
                <Text
                  style={[
                    styles.statIcon,
                    styles.cancelIcon,
                  ]}>
                  ×
                </Text>
              </View>

              <Text style={styles.statNumber}>
                {totalCancelled}
              </Text>
            </View>

            <Text style={styles.statLabel}>
              CANCELLED ALERTS
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statTopRow}>
              <View
                style={[
                  styles.statIconBox,
                  styles.totalIconBox,
                ]}>
                <Text
                  style={[
                    styles.statIcon,
                    styles.totalIcon,
                  ]}>
                  !
                </Text>
              </View>

              <Text style={styles.statNumber}>
                {historyData.length}
              </Text>
            </View>

            <Text style={styles.statLabel}>
              TOTAL RECORDS
            </Text>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>
            ⌕
          </Text>

          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search user, location or ID"
            placeholderTextColor="#A1A1A6"
            style={styles.searchInput}
          />

          {search.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              activeOpacity={0.8}
              onPress={() => setSearch('')}>
              <Text style={styles.clearText}>
                ×
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Header */}
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>
            FILTER HISTORY
          </Text>

          <Text style={styles.resultText}>
            {filteredHistory.length} results
          </Text>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterContainer}>
          {filters.map(filter => {
            const isSelected =
              selectedFilter === filter;

            return (
              <TouchableOpacity
                key={filter}
                activeOpacity={0.8}
                style={[
                  styles.filterButton,
                  isSelected &&
                    styles.filterButtonActive,
                ]}
                onPress={() =>
                  setSelectedFilter(filter)
                }>
                <Text
                  style={[
                    styles.filterText,
                    isSelected &&
                      styles.filterTextActive,
                  ]}>
                  {filter}
                </Text>

                <View
                  style={[
                    styles.filterCount,
                    isSelected &&
                      styles.filterCountActive,
                  ]}>
                  <Text
                    style={[
                      styles.filterCountText,
                      isSelected &&
                        styles.filterCountTextActive,
                    ]}>
                    {getFilterCount(filter)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* History */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.historyContainer}>
          {filteredHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconBox}>
                <Text style={styles.emptyIcon}>
                  ⌕
                </Text>
              </View>

              <Text style={styles.emptyTitle}>
                No History Found
              </Text>

              <Text style={styles.emptyDescription}>
                Try changing your search or filters.
              </Text>
            </View>
          ) : (
            filteredHistory.map(item => {
              const statusStyles =
                getStatusStyles(item.status);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.historyCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (onSosDetail) {
                      onSosDetail(item);
                    }
                  }}>
                  {/* Top Row */}
                  <View style={styles.cardTopRow}>
                    <View style={styles.userSection}>
                      <View
                        style={[
                          styles.userAvatar,
                          {
                            backgroundColor: item.color,
                          },
                        ]}>
                        <Text style={styles.userAvatarText}>
                          {item.initials}
                        </Text>
                      </View>

                      <View style={styles.userContent}>
                        <Text style={styles.userName}>
                          {item.userName}
                        </Text>

                        <Text style={styles.recordId}>
                          SOS #{item.id}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        statusStyles.badge,
                      ]}>
                      <View
                        style={[
                          styles.statusDot,
                          statusStyles.dot,
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusText,
                          statusStyles.text,
                        ]}>
                        {item.status}
                      </Text>
                    </View>
                  </View>

                  {/* Date */}
                  <View style={styles.dateRow}>
                    <View style={styles.dateIconBox}>
                      <Text style={styles.dateIcon}>
                        ◷
                      </Text>
                    </View>

                    <View style={styles.dateContent}>
                      <Text style={styles.dateLabel}>
                        ALERT DATE & TIME
                      </Text>

                      <Text style={styles.dateText}>
                        {item.date} • {item.time}
                      </Text>
                    </View>
                  </View>

                  {/* Location */}
                  <View style={styles.locationRow}>
                    <View style={styles.locationIconBox}>
                      <Text style={styles.locationIcon}>
                        ◉
                      </Text>
                    </View>

                    <View style={styles.locationContent}>
                      <Text style={styles.locationLabel}>
                        LOCATION
                      </Text>

                      <Text style={styles.locationText}>
                        {item.location}
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.divider} />

                  {/* Bottom */}
                  <View style={styles.cardBottom}>
                    <View style={styles.bottomLeft}>
                      <View
                        style={[
                          styles.priorityBadge,
                          item.priority === 'High'
                            ? styles.highPriorityBadge
                            : styles.normalPriorityBadge,
                        ]}>
                        <View
                          style={[
                            styles.priorityDot,
                            item.priority === 'High'
                              ? styles.highPriorityDot
                              : styles.normalPriorityDot,
                          ]}
                        />

                        <Text
                          style={[
                            styles.priorityText,
                            item.priority === 'High'
                              ? styles.highPriorityText
                              : styles.normalPriorityText,
                          ]}>
                          {item.priority}
                        </Text>
                      </View>

                      <Text style={styles.durationText}>
                        Duration: {item.duration}
                      </Text>
                    </View>

                    <View style={styles.viewDetails}>
                      <Text style={styles.viewText}>
                        Details
                      </Text>

                      <Text style={styles.arrowText}>
                        ›
                      </Text>
                    </View>
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

  header: {
    height: 74,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8EB',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },

  backButton: {
    width: 42,
    height: 42,
    justifyContent: 'center',
  },

  backIcon: {
    color: '#1A1A1A',
    fontSize: 38,
    lineHeight: 38,
    marginTop: -5,
  },

  headerContent: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '900',
  },

  headerSubtitle: {
    color: '#A1A1A6',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 4,
  },

  headerRight: {
    width: 42,
    alignItems: 'flex-end',
  },

  headerCount: {
    color: '#8B8B91',
    fontSize: 10,
    fontWeight: '900',
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
  },

  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 17,
  },

  statCard: {
    width: '31.5%',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 14,
    padding: 10,
  },

  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statIconBox: {
    width: 29,
    height: 29,
    borderRadius: 9,
    backgroundColor: '#EAF9F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statIcon: {
    color: '#22A06B',
    fontSize: 14,
    fontWeight: '900',
  },

  cancelIconBox: {
    backgroundColor: '#F1F1F3',
  },

  cancelIcon: {
    color: '#6E6E73',
  },

  totalIconBox: {
    backgroundColor: '#FDE5E8',
  },

  totalIcon: {
    color: '#E4002B',
  },

  statNumber: {
    color: '#1A1A1A',
    fontSize: 17,
    fontWeight: '900',
  },

  statLabel: {
    color: '#8B8B91',
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 0.4,
    marginTop: 10,
  },

  searchContainer: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E5E8',
    borderRadius: 13,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
  },

  searchIcon: {
    color: '#8B8B91',
    fontSize: 20,
    marginRight: 9,
  },

  searchInput: {
    flex: 1,
    height: '100%',
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '600',
  },

  clearButton: {
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#EEEEF0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  clearText: {
    color: '#6E6E73',
    fontSize: 19,
    lineHeight: 22,
  },

  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 9,
  },

  filterTitle: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  resultText: {
    color: '#A1A1A6',
    fontSize: 9,
    fontWeight: '700',
  },

  filterContainer: {
    paddingBottom: 5,
  },

  filterButton: {
    height: 37,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E2E5',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },

  filterButtonActive: {
    backgroundColor: '#E4002B',
    borderColor: '#E4002B',
  },

  filterText: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '800',
  },

  filterTextActive: {
    color: '#FFFFFF',
  },

  filterCount: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },

  filterCountActive: {
    backgroundColor: 'rgba(255,255,255,0.20)',
  },

  filterCountText: {
    color: '#6E6E73',
    fontSize: 8,
    fontWeight: '900',
  },

  filterCountTextActive: {
    color: '#FFFFFF',
  },

  historyContainer: {
    paddingTop: 14,
  },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 11,
  },

  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  userAvatar: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  userContent: {
    flex: 1,
  },

  userName: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '900',
  },

  recordId: {
    color: '#8B8B91',
    fontSize: 8,
    marginTop: 4,
  },

  statusBadge: {
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },

  resolvedBadge: {
    backgroundColor: '#EAF9F0',
  },

  cancelledBadge: {
    backgroundColor: '#F1F1F3',
  },

  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 4,
    marginRight: 4,
  },

  resolvedDot: {
    backgroundColor: '#22A06B',
  },

  cancelledDot: {
    backgroundColor: '#8B8B91',
  },

  statusText: {
    fontSize: 8,
    fontWeight: '900',
  },

  resolvedText: {
    color: '#178A4B',
  },

  cancelledText: {
    color: '#6E6E73',
  },

  dateRow: {
    backgroundColor: '#FAFAFB',
    borderRadius: 10,
    padding: 9,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 13,
  },

  dateIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  dateIcon: {
    color: '#6E6E73',
    fontSize: 14,
  },

  dateContent: {
    flex: 1,
  },

  dateLabel: {
    color: '#A1A1A6',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  dateText: {
    color: '#3B3B3F',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },

  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },

  locationIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FDE5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },

  locationIcon: {
    color: '#E4002B',
    fontSize: 15,
  },

  locationContent: {
    flex: 1,
  },

  locationLabel: {
    color: '#A1A1A6',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
  },

  locationText: {
    color: '#3B3B3F',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEEEF0',
    marginVertical: 12,
  },

  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  priorityBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
  },

  highPriorityBadge: {
    backgroundColor: '#FFF2DE',
  },

  normalPriorityBadge: {
    backgroundColor: '#F1F1F3',
  },

  priorityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 5,
  },

  highPriorityDot: {
    backgroundColor: '#D88900',
  },

  normalPriorityDot: {
    backgroundColor: '#8B8B91',
  },

  priorityText: {
    fontSize: 8,
    fontWeight: '900',
  },

  highPriorityText: {
    color: '#B87200',
  },

  normalPriorityText: {
    color: '#6E6E73',
  },

  durationText: {
    color: '#8B8B91',
    fontSize: 8,
    fontWeight: '700',
    marginLeft: 8,
  },

  viewDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  viewText: {
    color: '#E4002B',
    fontSize: 9,
    fontWeight: '800',
  },

  arrowText: {
    color: '#E4002B',
    fontSize: 20,
    marginLeft: 5,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 70,
  },

  emptyIconBox: {
    width: 65,
    height: 65,
    borderRadius: 33,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    color: '#8B8B91',
    fontSize: 28,
  },

  emptyTitle: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '900',
    marginTop: 15,
  },

  emptyDescription: {
    color: '#8B8B91',
    fontSize: 10,
    marginTop: 6,
  },

  bottomSpace: {
    height: 30,
  },
});

export default AdminHistoryScreen;