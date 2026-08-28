import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
  TextInput,
} from 'react-native';
import {listUsers} from '../../api/resources';
import {SafeAreaView as ContextSafeAreaView} from 'react-native-safe-area-context';

const AdminUsersScreen = ({
  token,
  onBack,
  onUserDetail,
  onProfile,
  currentAdmin,
}) => {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listUsers(token)
      .then(result => {
        if (!mounted) return;
        setUsers((result.users || []).map(item => ({
          ...item,
          name: item.username,
          phone: item.mobileNumber,
          accountStatus: item.status,
          status: item.status === 'active' ? 'Active' : 'Inactive',
          email: item.email || 'No email configured',
          initials: item.username.slice(0, 2).toUpperCase(),
          joined: item.createdAt ? `Joined ${new Date(item.createdAt).toLocaleDateString()}` : 'Join date unavailable',
          color: '#C62828',
        })));
      })
      .catch(requestError => mounted && setError(requestError.message))
      .finally(() => mounted && setLoading(false));

    return () => {
      mounted = false;
    };
  }, [token]);

  const filters = [
    'All',
    'Active',
    'Inactive',
  ];

  const filteredUsers = users.filter(user => {
    const searchValue = search.toLowerCase();

    const matchesSearch =
      user.name.toLowerCase().includes(searchValue) ||
      user.email.toLowerCase().includes(searchValue) ||
      user.phone.toLowerCase().includes(searchValue);

    const matchesFilter =
      activeFilter === 'All'
        ? true
        : user.status === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const getStatusStyle = status => {
    if (status === 'Active') {
      return {
        container: styles.activeStatus,
        dot: styles.activeDot,
        text: styles.activeStatusText,
      };
    }

    if (status === 'Blocked') {
      return {
        container: styles.blockedStatus,
        dot: styles.blockedDot,
        text: styles.blockedStatusText,
      };
    }

    return {
      container: styles.inactiveStatus,
      dot: styles.inactiveDot,
      text: styles.inactiveStatusText,
    };
  };

  const getFilterCount = filter => {
    if (filter === 'All') {
      return users.length;
    }

    return users.filter(
      user => user.status === filter,
    ).length;
  };

  return (
    <ContextSafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
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
            Manage Users
          </Text>

          <Text style={styles.headerSubtitle}>
            {users.length} REGISTERED USERS
          </Text>
        </View>

        <TouchableOpacity
          style={styles.headerProfile}
          activeOpacity={0.8}
          onPress={onProfile}>
          <Text style={styles.headerProfileText}>
            {(currentAdmin?.username || 'A').slice(0, 2).toUpperCase()}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.container}>

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>⌕</Text>

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search users by name or email"
            placeholderTextColor="#A1A1A6"
          />

          {search.length > 0 && (
            <TouchableOpacity
              style={styles.clearButton}
              activeOpacity={0.8}
              onPress={() => setSearch('')}>
              <Text style={styles.clearButtonText}>
                ×
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter */}
        <View style={styles.filterHeader}>
          <Text style={styles.filterTitle}>
            FILTER USERS
          </Text>

          <Text style={styles.resultCount}>
            {filteredUsers.length} results
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}>
          {filters.map(filter => {
            const isActive =
              activeFilter === filter;

            return (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  isActive &&
                    styles.filterButtonActive,
                ]}
                activeOpacity={0.8}
                onPress={() =>
                  setActiveFilter(filter)
                }>
                <Text
                  style={[
                    styles.filterButtonText,
                    isActive &&
                      styles.filterButtonTextActive,
                  ]}>
                  {filter}
                </Text>

                <View
                  style={[
                    styles.filterCount,
                    isActive &&
                      styles.filterCountActive,
                  ]}>
                  <Text
                    style={[
                      styles.filterCountText,
                      isActive &&
                        styles.filterCountTextActive,
                    ]}>
                    {getFilterCount(filter)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryDot,
                styles.summaryActiveDot,
              ]}
            />

            <Text style={styles.summaryText}>
              Active
            </Text>

            <Text style={styles.summaryNumber}>
              {getFilterCount('Active')}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryDot,
                styles.summaryInactiveDot,
              ]}
            />

            <Text style={styles.summaryText}>
              Inactive
            </Text>

            <Text style={styles.summaryNumber}>
              {getFilterCount('Inactive')}
            </Text>
          </View>

          <View style={styles.summaryItem}>
            <View
              style={[
                styles.summaryDot,
                styles.summaryBlockedDot,
              ]}
            />

            <Text style={styles.summaryText}>
              Blocked
            </Text>

            <Text style={styles.summaryNumber}>
              {getFilterCount('Blocked')}
            </Text>
          </View>
        </View>

        {/* Users List */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.usersList}>

          {loading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Loading users...</Text>
            </View>
          ) : error ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Unable to load users</Text>
              <Text style={styles.emptyDescription}>{error}</Text>
            </View>
          ) : filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconContainer}>
                <Text style={styles.emptyIcon}>
                  ⌕
                </Text>
              </View>

              <Text style={styles.emptyTitle}>
                No Users Found
              </Text>

              <Text style={styles.emptyDescription}>
                Try changing your search or filter.
              </Text>
            </View>
          ) : (
            filteredUsers.map(user => {
              const statusStyle =
                getStatusStyle(user.status);

              return (
                <TouchableOpacity
                  key={user.id}
                  style={styles.userCard}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (onUserDetail) {
                      onUserDetail(user);
                    }
                  }}>
                  {/* Top Row */}
                  <View style={styles.userTopRow}>
                    <View style={styles.userLeft}>
                      <View
                        style={[
                          styles.userAvatar,
                          {
                            backgroundColor:
                              user.color,
                          },
                        ]}>
                        <Text style={styles.userAvatarText}>
                          {user.initials}
                        </Text>
                      </View>

                      <View style={styles.userMainInfo}>
                        <Text style={styles.userName}>
                          {user.name}
                        </Text>

                        <Text style={styles.userEmail}>
                          {user.email}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.statusBadge,
                        statusStyle.container,
                      ]}>
                      <View
                        style={[
                          styles.statusDot,
                          statusStyle.dot,
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusText,
                          statusStyle.text,
                        ]}>
                        {user.status}
                      </Text>
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={styles.cardDivider} />

                  {/* Bottom Row */}
                  <View style={styles.userBottomRow}>
                    <View style={styles.phoneContainer}>
                      <Text style={styles.phoneIcon}>
                        ☎
                      </Text>

                      <Text style={styles.phoneText}>
                        {user.phone}
                      </Text>
                    </View>

                    <View style={styles.joinedContainer}>
                      <Text style={styles.joinedText}>
                        {user.joined}
                      </Text>

                      <Text style={styles.userArrow}>
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
    </ContextSafeAreaView>
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

  headerProfile: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
  },

  headerProfileText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
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

  clearButtonText: {
    color: '#6E6E73',
    fontSize: 19,
    lineHeight: 22,
  },

  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 9,
  },

  filterTitle: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  resultCount: {
    color: '#A1A1A6',
    fontSize: 9,
    fontWeight: '700',
  },

  filterScroll: {
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

  filterButtonText: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '800',
  },

  filterButtonTextActive: {
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

  summaryRow: {
    height: 58,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8E8EB',
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 5,
  },

  summaryActiveDot: {
    backgroundColor: '#22A06B',
  },

  summaryInactiveDot: {
    backgroundColor: '#A1A1A6',
  },

  summaryBlockedDot: {
    backgroundColor: '#E4002B',
  },

  summaryText: {
    color: '#7A7A7F',
    fontSize: 8,
    fontWeight: '700',
  },

  summaryNumber: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '900',
    marginLeft: 5,
  },

  usersList: {
    paddingTop: 15,
  },

  userCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 15,
    padding: 14,
    marginBottom: 11,
  },

  userTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  userLeft: {
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

  userMainInfo: {
    flex: 1,
  },

  userName: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '900',
  },

  userEmail: {
    color: '#8B8B91',
    fontSize: 9,
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

  activeStatus: {
    backgroundColor: '#EAF9F0',
  },

  inactiveStatus: {
    backgroundColor: '#F1F1F3',
  },

  blockedStatus: {
    backgroundColor: '#FDE5E8',
  },

  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    marginRight: 4,
  },

  activeDot: {
    backgroundColor: '#22A06B',
  },

  inactiveDot: {
    backgroundColor: '#8B8B91',
  },

  blockedDot: {
    backgroundColor: '#E4002B',
  },

  statusText: {
    fontSize: 8,
    fontWeight: '900',
  },

  activeStatusText: {
    color: '#178A4B',
  },

  inactiveStatusText: {
    color: '#6E6E73',
  },

  blockedStatusText: {
    color: '#E4002B',
  },

  cardDivider: {
    height: 1,
    backgroundColor: '#EEEEF0',
    marginVertical: 12,
  },

  userBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  phoneIcon: {
    color: '#A1A1A6',
    fontSize: 12,
    marginRight: 5,
  },

  phoneText: {
    color: '#6E6E73',
    fontSize: 9,
    fontWeight: '600',
  },

  joinedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  joinedText: {
    color: '#A1A1A6',
    fontSize: 8,
  },

  userArrow: {
    color: '#A1A1A6',
    fontSize: 20,
    marginLeft: 5,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },

  emptyIconContainer: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#EEEEF0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyIcon: {
    color: '#8B8B91',
    fontSize: 26,
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

export default AdminUsersScreen;