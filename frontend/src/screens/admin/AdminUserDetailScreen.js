import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import {deleteUser, setUserPassword, setUserStatus, updateUser} from '../../api/resources';
import {SafeAreaView} from 'react-native-safe-area-context';
import Header from '../../components/Header';

const AdminUserDetailScreen = ({
  user,
  onBack,
  onSosDetail,
  token,
}) => {
  const [isBlocked, setIsBlocked] = useState(
    (user?.accountStatus || user?.status) !== 'active',
  );
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [editForm, setEditForm] = useState({
    username: user?.username || user?.name || '',
    mobileNumber: user?.mobileNumber || user?.phone || '',
    email: user?.email === 'No email configured' ? '' : (user?.email || ''),
  });
  const [selectedUser, setSelectedUser] = useState(user);

  if (!user) return null;
  const sosHistory = [];

  const handleBlockUser = () => {
    Alert.alert(
      isBlocked ? 'Unblock User' : 'Block User',
      isBlocked
        ? `Are you sure you want to unblock ${selectedUser.name}?`
        : `Are you sure you want to block ${selectedUser.name}?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: isBlocked ? 'Unblock' : 'Block',
          style: isBlocked ? 'default' : 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await setUserStatus(token, selectedUser._id || selectedUser.id, isBlocked);
              setIsBlocked(!isBlocked);
            } catch (error) {
              Alert.alert('Unable to update user', error.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleDeleteUser = () => {
    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${selectedUser.name}? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await deleteUser(token, selectedUser._id || selectedUser.id);
              Alert.alert('User deleted', 'The user has been removed.', [{text: 'OK', onPress: onBack}]);
            } catch (error) {
              Alert.alert('Unable to delete user', error.message || 'Please try again.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const handleSaveUser = async () => {
    if (!editForm.username.trim() || !editForm.mobileNumber.trim()) {
      Alert.alert('Check the form', 'Username and mobile number are required.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await updateUser(token, selectedUser._id || selectedUser.id, {
        username: editForm.username.trim(),
        mobileNumber: editForm.mobileNumber.trim(),
        email: editForm.email.trim() || null,
      });
      if (response?.user) {
        setSelectedUser(current => ({...current, ...response.user, name: response.user.username, phone: response.user.mobileNumber, email: response.user.email || 'No email configured'}));
      }
      setEditing(false);
      Alert.alert('User updated', 'The user details were saved.');
    } catch (error) {
      Alert.alert('Unable to update user', error.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert('Check the password', 'The new password must be at least 8 characters.');
      return;
    }
    setSubmitting(true);
    try {
      await setUserPassword(token, selectedUser._id || selectedUser.id, newPassword);
      setNewPassword('');
      setResettingPassword(false);
      Alert.alert('Password updated', 'The new password was saved securely.');
    } catch (error) {
      Alert.alert('Unable to reset password', error.message || 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['left', 'right', 'bottom']}>
      <Header title="User Details" subtitle="ADMIN VIEW" onBack={onBack} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* User Profile Card */}
        <View style={styles.profileCard}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: selectedUser.color,
              },
            ]}>
            <Text style={styles.avatarText}>
              {selectedUser.initials}
            </Text>
          </View>

          <Text style={styles.userName}>
            {selectedUser.name}
          </Text>

          <View
            style={[
              styles.statusBadge,
              isBlocked
                ? styles.blockedBadge
                : styles.activeBadge,
            ]}>
            <View
              style={[
                styles.statusDot,
                isBlocked
                  ? styles.blockedDot
                  : styles.activeDot,
              ]}
            />

            <Text
              style={[
                styles.statusText,
                isBlocked
                  ? styles.blockedText
                  : styles.activeText,
              ]}>
                  {isBlocked ? 'Inactive' : 'Active'}
            </Text>
          </View>

          <Text style={styles.joinedText}>
            Member since {selectedUser.joined}
          </Text>
        </View>

        {/* Contact Information */}
        <Text style={styles.sectionTitle}>
          CONTACT INFORMATION
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Text style={styles.infoIcon}>✉</Text>
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                EMAIL ADDRESS
              </Text>

              <Text style={styles.infoValue}>
                {selectedUser.email}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Text style={styles.infoIcon}>☎</Text>
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                PHONE NUMBER
              </Text>

              <Text style={styles.infoValue}>
                {selectedUser.phone}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoIconBox}>
              <Text style={styles.infoIcon}>◉</Text>
            </View>

            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>
                ACCOUNT STATUS
              </Text>

              <Text style={styles.infoValue}>
                {isBlocked
                  ? 'Account is blocked'
                  : 'Account is active'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>EDIT PROFILE</Text>
        {editing ? (
          <View style={styles.infoCard}>
            <Text style={styles.editLabel}>USERNAME</Text>
            <TextInput style={styles.editInput} value={editForm.username} onChangeText={username => setEditForm(current => ({...current, username}))} autoCapitalize="none" />
            <Text style={styles.editLabel}>MOBILE NUMBER</Text>
            <TextInput style={styles.editInput} value={editForm.mobileNumber} onChangeText={mobileNumber => setEditForm(current => ({...current, mobileNumber}))} keyboardType="phone-pad" />
            <Text style={styles.editLabel}>EMAIL</Text>
            <TextInput style={styles.editInput} value={editForm.email} onChangeText={email => setEditForm(current => ({...current, email}))} keyboardType="email-address" autoCapitalize="none" />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => setEditing(false)} style={styles.editCancel}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleSaveUser} disabled={submitting} style={styles.editSave}><Text style={styles.editSaveText}>{submitting ? 'Saving...' : 'Save changes'}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.editButton} onPress={() => setEditing(true)}><Text style={styles.editButtonText}>Edit user</Text></TouchableOpacity>
        )}
        {resettingPassword ? (
          <View style={styles.infoCard}>
            <Text style={styles.editLabel}>NEW PASSWORD</Text>
            <TextInput style={styles.editInput} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" placeholder="At least 8 characters" />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => {setResettingPassword(false); setNewPassword('');}} style={styles.editCancel}><Text>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleResetPassword} disabled={submitting} style={styles.editSave}><Text style={styles.editSaveText}>{submitting ? 'Updating...' : 'Reset password'}</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity style={styles.editButton} onPress={() => setResettingPassword(true)}><Text style={styles.editButtonText}>Reset password</Text></TouchableOpacity>
        )}

        {/* Account Activity */}
        <Text style={styles.sectionTitle}>
          ACCOUNT ACTIVITY
        </Text>

        <View style={styles.statsContainer}>
          <View style={styles.activityCard}>
            <View
              style={[
                styles.activityIcon,
                styles.sosActivityIcon,
              ]}>
              <Text style={styles.activityIconText}>
                !
              </Text>
            </View>

            <Text style={styles.activityNumber}>
              0
            </Text>

            <Text style={styles.activityLabel}>
              Total SOS
            </Text>
          </View>

          <View style={styles.activityCard}>
            <View
              style={[
                styles.activityIcon,
                styles.resolvedActivityIcon,
              ]}>
              <Text
                style={[
                  styles.activityIconText,
                  styles.resolvedIconText,
                ]}>
                ✓
              </Text>
            </View>

            <Text style={styles.activityNumber}>
              0
            </Text>

            <Text style={styles.activityLabel}>
              Resolved
            </Text>
          </View>

          <View style={styles.activityCard}>
            <View
              style={[
                styles.activityIcon,
                styles.contactsActivityIcon,
              ]}>
              <Text
                style={[
                  styles.activityIconText,
                  styles.contactsIconText,
                ]}>
                ♙
              </Text>
            </View>

            <Text style={styles.activityNumber}>
              0
            </Text>

            <Text style={styles.activityLabel}>
              Contacts
            </Text>
          </View>
        </View>

        {/* SOS History */}
        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitleNoMargin}>
            SOS HISTORY
          </Text>

          <Text style={styles.historyCount}>
            12 TOTAL
          </Text>
        </View>

        <View style={styles.historyCard}>
          {sosHistory.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={styles.historyItem}
              activeOpacity={0.8}
              onPress={() => {
                if (onSosDetail) {
                  onSosDetail(item);
                }
              }}>
              <View style={styles.historyLeft}>
                <View style={styles.historyIconBox}>
                  <Text style={styles.historyIcon}>
                    !
                  </Text>
                </View>

                <View style={styles.historyInfo}>
                  <Text style={styles.historyDate}>
                    {item.date}
                  </Text>

                  <Text style={styles.historyLocation}>
                    {item.location}
                  </Text>

                  <Text style={styles.historyTime}>
                    {item.time} • {item.duration}
                  </Text>
                </View>
              </View>

              <View style={styles.historyRight}>
                <View style={styles.resolvedBadge}>
                  <Text style={styles.resolvedBadgeText}>
                    {item.status}
                  </Text>
                </View>

                <Text style={styles.historyArrow}>
                  ›
                </Text>
              </View>

              {index !== sosHistory.length - 1 && (
                <View style={styles.historyDivider} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Admin Actions */}
        <Text style={styles.sectionTitle}>
          ADMIN ACTIONS
        </Text>

        <View style={styles.actionCard}>
          <TouchableOpacity
            style={[styles.actionRow, submitting && styles.disabledAction]}
            activeOpacity={0.8}
            onPress={handleBlockUser}>
            <View
              style={[
                styles.actionIconBox,
                isBlocked
                  ? styles.unblockIconBox
                  : styles.blockIconBox,
              ]}>
              <Text
                style={[
                  styles.actionIcon,
                  isBlocked
                    ? styles.unblockIcon
                    : styles.blockIcon,
                ]}>
                {isBlocked ? '✓' : '×'}
              </Text>
            </View>

            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>
                {isBlocked
                  ? 'Unblock User'
                  : 'Block User'}
              </Text>

              <Text style={styles.actionDescription}>
                {isBlocked
                  ? 'Allow this user to access the application again.'
                  : 'Prevent this user from accessing the application.'}
              </Text>
            </View>

            <Text style={styles.actionArrow}>
              ›
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.actionRow, submitting && styles.disabledAction]}
            activeOpacity={0.8}
            onPress={handleDeleteUser}>
            <View
              style={[
                styles.actionIconBox,
                styles.deleteIconBox,
              ]}>
              <Text
                style={[
                  styles.actionIcon,
                  styles.deleteIcon,
                ]}>
                ×
              </Text>
            </View>

            <View style={styles.actionContent}>
              <Text
                style={[
                  styles.actionTitle,
                  styles.deleteTitle,
                ]}>
                Delete User
              </Text>

              <Text style={styles.actionDescription}>
                Permanently remove this account and its
                associated data.
              </Text>
            </View>

            <Text
              style={[
                styles.actionArrow,
                styles.deleteArrow,
              ]}>
              ›
            </Text>
          </TouchableOpacity>
        </View>

        {/* Warning */}
        <View style={styles.warningCard}>
          <View style={styles.warningIconBox}>
            <Text style={styles.warningIcon}>!</Text>
          </View>

          <Text style={styles.warningText}>
            Administrative actions are logged for security
            and audit purposes.
          </Text>
        </View>

        <View style={styles.bottomSpace} />
      </ScrollView>
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

  moreButton: {
    width: 42,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  moreText: {
    color: '#6E6E73',
    fontSize: 16,
    letterSpacing: 2,
  },

  scrollContent: {
    padding: 20,
    paddingBottom: 35,
  },

  profileCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 18,
    alignItems: 'center',
    paddingVertical: 23,
  },

  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },

  userName: {
    color: '#1A1A1A',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 12,
  },

  statusBadge: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },

  activeBadge: {
    backgroundColor: '#EAF9F0',
  },

  blockedBadge: {
    backgroundColor: '#FDE5E8',
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 4,
    marginRight: 5,
  },

  activeDot: {
    backgroundColor: '#22A06B',
  },

  blockedDot: {
    backgroundColor: '#E4002B',
  },

  statusText: {
    fontSize: 9,
    fontWeight: '900',
  },

  activeText: {
    color: '#178A4B',
  },

  blockedText: {
    color: '#E4002B',
  },

  joinedText: {
    color: '#A1A1A6',
    fontSize: 9,
    marginTop: 9,
  },

  sectionTitle: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 25,
    marginBottom: 10,
  },

  sectionTitleNoMargin: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
  },

  infoCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 16,
    paddingHorizontal: 14,
  },

  editButton: {
    backgroundColor: '#1A1A1A',
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },

  editButtonText: {color: '#FFFFFF', fontWeight: '900'},

  editLabel: {
    color: '#6E6E73',
    fontSize: 10,
    fontWeight: '900',
    marginTop: 12,
    marginBottom: 5,
  },

  editInput: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#D8DDE3',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#1A1A1A',
  },

  editActions: {flexDirection: 'row', gap: 10, marginVertical: 14},
  editCancel: {flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F4', borderRadius: 10},
  editSave: {flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4002B', borderRadius: 10},
  editSaveText: {color: '#FFFFFF', fontWeight: '900'},

  infoRow: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
  },

  infoIconBox: {
    width: 39,
    height: 39,
    borderRadius: 11,
    backgroundColor: '#FDE5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  infoIcon: {
    color: '#E4002B',
    fontSize: 17,
    fontWeight: '900',
  },

  infoContent: {
    flex: 1,
  },

  infoLabel: {
    color: '#A1A1A6',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  infoValue: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEEEF0',
  },

  statsContainer: {
    flexDirection: 'row',
    gap: 9,
  },

  activityCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 15,
    alignItems: 'center',
    paddingVertical: 14,
  },

  activityIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sosActivityIcon: {
    backgroundColor: '#FDE5E8',
  },

  resolvedActivityIcon: {
    backgroundColor: '#EAF9F0',
  },

  contactsActivityIcon: {
    backgroundColor: '#EAF3FF',
  },

  activityIconText: {
    color: '#E4002B',
    fontSize: 19,
    fontWeight: '900',
  },

  resolvedIconText: {
    color: '#22A06B',
  },

  contactsIconText: {
    color: '#2777D3',
  },

  activityNumber: {
    color: '#1A1A1A',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 8,
  },

  activityLabel: {
    color: '#8B8B91',
    fontSize: 8,
    fontWeight: '700',
    marginTop: 3,
  },

  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 10,
  },

  historyCount: {
    color: '#E4002B',
    fontSize: 8,
    fontWeight: '900',
  },

  historyCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 16,
    overflow: 'hidden',
  },

  historyItem: {
    minHeight: 91,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  historyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FDE5E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  historyIcon: {
    color: '#E4002B',
    fontSize: 20,
    fontWeight: '900',
  },

  historyInfo: {
    flex: 1,
  },

  historyDate: {
    color: '#1A1A1A',
    fontSize: 10,
    fontWeight: '800',
  },

  historyLocation: {
    color: '#7A7A7F',
    fontSize: 8,
    marginTop: 4,
  },

  historyTime: {
    color: '#A1A1A6',
    fontSize: 8,
    marginTop: 3,
  },

  historyRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  resolvedBadge: {
    backgroundColor: '#EAF9F0',
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },

  resolvedBadgeText: {
    color: '#178A4B',
    fontSize: 8,
    fontWeight: '900',
  },

  historyArrow: {
    color: '#A1A1A6',
    fontSize: 20,
    marginTop: 5,
  },

  historyDivider: {
    position: 'absolute',
    height: 1,
    backgroundColor: '#EEEEF0',
    left: 63,
    right: 0,
    bottom: 0,
  },

  actionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E7EA',
    borderRadius: 16,
    paddingHorizontal: 14,
  },

  actionRow: {
    minHeight: 79,
    flexDirection: 'row',
    alignItems: 'center',
  },

  disabledAction: {
    opacity: 0.5,
  },

  actionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 11,
  },

  blockIconBox: {
    backgroundColor: '#FFF2DE',
  },

  unblockIconBox: {
    backgroundColor: '#EAF9F0',
  },

  deleteIconBox: {
    backgroundColor: '#FDE5E8',
  },

  actionIcon: {
    fontSize: 22,
    fontWeight: '900',
  },

  blockIcon: {
    color: '#D88900',
  },

  unblockIcon: {
    color: '#22A06B',
  },

  deleteIcon: {
    color: '#E4002B',
  },

  actionContent: {
    flex: 1,
  },

  actionTitle: {
    color: '#1A1A1A',
    fontSize: 11,
    fontWeight: '900',
  },

  deleteTitle: {
    color: '#E4002B',
  },

  actionDescription: {
    color: '#8B8B91',
    fontSize: 8,
    lineHeight: 13,
    marginTop: 4,
  },

  actionArrow: {
    color: '#8B8B91',
    fontSize: 23,
    marginLeft: 5,
  },

  deleteArrow: {
    color: '#E4002B',
  },

  warningCard: {
    backgroundColor: '#FFF8E9',
    borderWidth: 1,
    borderColor: '#F8E2A9',
    borderRadius: 13,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },

  warningIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FFE9B8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },

  warningIcon: {
    color: '#C98200',
    fontSize: 16,
    fontWeight: '900',
  },

  warningText: {
    flex: 1,
    color: '#80672D',
    fontSize: 8,
    lineHeight: 13,
    fontWeight: '600',
  },

  bottomSpace: {
    height: 20,
  },
});

export default AdminUserDetailScreen;