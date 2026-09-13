import {getUserInitials} from '../../utils/userInitials';
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Clipboard, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {createUser, deleteCollection, deleteUser, getUserCredentials, listCollectionUsers, listCollections, setUserPassword, updateCollection, updateUser} from '../../api/resources';
import {rememberCredential} from '../../utils/adminCredentials';
import Icon from '../../components/Icon';

const EMPTY_USER = {username: '', mobileNumber: '+', email: '', password: ''};
const TYPES = ['family', 'workers', 'other'];
const collectionSnapshots = new Map();
const memberSnapshots = new Map();
export const clearCollectionSnapshots = () => { collectionSnapshots.clear(); memberSnapshots.clear(); };
const capitalizeFirstWord = value => { const text = String(value || '').trim(); return text ? text.charAt(0).toUpperCase() + text.slice(1) : ''; };

export default function AdminCollectionsBackendScreen({token, onBack, onAddCollection, onEditCollection, onUserDetail, onEditUser, initialCredentials = {}, onCredentialRemember}) {
  const insets = useSafeAreaInsets();
  const [collections, setCollections] = useState(() => collectionSnapshots.get(token) || []);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(() => !collectionSnapshots.has(token));
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState('');
  const [memberError, setMemberError] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false); // ✅ Always false - Edit hidden
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [credentialMap, setCredentialMap] = useState(initialCredentials);

  const loadCollections = useCallback(async ({initial = false, forceRefresh = false} = {}) => {
    setLoading(true);
    try {
      const response = await listCollections(token, undefined, {forceRefresh});
      const nextCollections = response.collections || [];
      setCollections(nextCollections);
      collectionSnapshots.set(token, nextCollections);
      setError('');
    } catch (requestError) {
      if (!collectionSnapshots.has(token) || collections.length === 0) setError(requestError.message || 'Unable to load groups. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadCollections({initial: !collectionSnapshots.has(token), forceRefresh: true});
    const timer = setInterval(() => loadCollections({forceRefresh: true}), 30000);
    return () => clearInterval(timer);
  }, [loadCollections, token]);

  const openCollection = async collection => {
    setSelected(collection);
    setEditForm({...collection});
    const memberKey = `${token}:${collection._id}`;
    const cachedEntry = memberSnapshots.get(memberKey);
    const cachedMembers = cachedEntry?.items || null;
    const cacheFresh = cachedEntry && Date.now() - cachedEntry.fetchedAt < 60000;
    if (cachedMembers) setMembers(cachedMembers);
    setMembersLoading(!cachedMembers);
    if (cacheFresh && cachedMembers) {
      listCollectionUsers(token, collection._id, {limit: 100}, {forceRefresh: true})
        .then(response => {
          const nextMembers = response.users || [];
          memberSnapshots.set(memberKey, {items: nextMembers, fetchedAt: Date.now()});
          setMembers(nextMembers);
          setMemberError('');
        })
        .catch(() => undefined);
      return;
    }
    setMemberError('');
    try {
      const response = await listCollectionUsers(token, collection._id, {limit: 100});
      const nextMembers = response.users || [];
      memberSnapshots.set(memberKey, {items: nextMembers, fetchedAt: Date.now()});
      setMembers(nextMembers);
      setMemberError('');
    } catch (requestError) {
      setMemberError(requestError.message || 'Unable to load group users.');
      if (!cachedMembers) setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  useEffect(() => {
    if (!selected || !token) return undefined;
    const refreshMembers = async () => {
      try {
        const response = await listCollectionUsers(token, selected._id, {limit: 100}, {forceRefresh: true});
        const nextMembers = response.users || [];
        memberSnapshots.set(`${token}:${selected._id}`, {items: nextMembers, fetchedAt: Date.now()});
        setMembers(nextMembers);
      } catch (_) {}
    };
    const timer = setInterval(refreshMembers, 10000);
    return () => clearInterval(timer);
  }, [selected?._id, token]);

  // ✅ REMOVED: saveCollection function - Edit collection hidden

  const submitUser = async () => {
    if (editingUser) {
      const userId = editingUser._id || editingUser.id;
      const payload = {
        username: userForm.username.trim(),
        mobileNumber: userForm.mobileNumber.trim(),
      };
      if (userForm.email.trim()) payload.email = userForm.email.trim();
      if (!userId || !payload.username || !payload.mobileNumber) {
        setError('Username and mobile number are required.');
        return;
      }
      if (!/^\+[0-9]{7,15}$/.test(payload.mobileNumber)) {
        setError('Mobile number must include country code, e.g. +923001234567.');
        return;
      }
      if (userForm.password && userForm.password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      setSubmitting(true);
      try {
        await updateUser(token, userId, payload);
        if (userForm.password) await setUserPassword(token, userId, userForm.password);
        setUserForm(EMPTY_USER);
        setEditingUser(null);
        setShowUserForm(false);
        memberSnapshots.delete(`${token}:${selected._id}`);
        await openCollection(selected);
      } catch (requestError) {
        setError(requestError.message || 'Unable to update user.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const payload = {username: userForm.username.trim(), mobileNumber: userForm.mobileNumber.trim(), password: userForm.password, collectionId: selected._id};
    if (userForm.email.trim()) payload.email = userForm.email.trim();
    if (!payload.username || !payload.mobileNumber || !payload.password) {
      setError('Username, mobile number, and password are required.');
      return;
    }
    if (!/^\+[0-9]{7,15}$/.test(payload.mobileNumber)) {
      setError('Mobile number must include country code, e.g. +923001234567.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await createUser(token, payload);
      const createdUser = response?.user || response?.data || response;
      const createdId = createdUser?._id || createdUser?.id;

      if (createdId) {
        setCredentialMap(current => rememberCredential(current, createdUser, payload.password));
        onCredentialRemember?.(createdUser, payload.password);
      }

      setUserForm(EMPTY_USER);
      setShowUserForm(false);
      if (createdUser && createdId) {
        setMembers(current => {
          const nextMembers = [createdUser, ...current.filter(item => (item._id || item.id) !== createdId)];
          memberSnapshots.set(`${token}:${selected._id}`, {items: nextMembers, fetchedAt: Date.now()});
          return nextMembers;
        });
      }
      openCollection(selected).catch(() => undefined);
      Alert.alert('User created', 'The user can now sign in with these credentials.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const startUserEdit = member => {
    setEditingUser(member);
    setUserForm({
      username: member.username || '',
      mobileNumber: String(member.mobileNumber || '').startsWith('+') ? member.mobileNumber : `+${member.mobileNumber || ''}`,
      email: member.email || '',
      password: '',
    });
    setShowUserForm(true);
  };

  const handleCopyCredentials = async member => {
    const memberId = member?._id || member?.id;
    try {
      let password = credentialMap[memberId] || '';
      let username = member?.username || '';
      if (!password && memberId) {
        const response = await getUserCredentials(token, memberId);
        username = response?.credentials?.username || username;
        password = response?.credentials?.password || '';
        if (password) {
          setCredentialMap(current => rememberCredential(current, {id: memberId, username}, password));
        }
      }
      if (!username || !password) throw new Error('Credentials are not available for this user.');
      await Clipboard.setString(`${username}\n${password}`);
      Alert.alert('Copied', 'Username and password copied to clipboard.');
    } catch (requestError) {
      Alert.alert('Copy unavailable', requestError.message || 'Unable to retrieve credentials.');
    }
  };

  const handleDeleteMember = async member => {
    const memberId = member?._id || member?.id;
    if (!memberId) return;

    Alert.alert('Delete user', `Are you sure you want to delete ${member.username || 'this user'}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteUser(token, memberId);
            memberSnapshots.delete(`${token}:${selected._id}`);
            setMembers(current => current.filter(item => (item._id || item.id) !== memberId));
            Alert.alert('User deleted', 'The user has been removed.');
          } catch (requestError) {
            Alert.alert('Unable to delete user', requestError.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteCollection = collection => {
    const collectionId = collection?._id || collection?.id;
    if (!collectionId) return;
    Alert.alert('Delete group', `Are you sure you want to permanently delete ${collection.name || 'this group'}?`, [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await deleteCollection(token, collectionId);
          collectionSnapshots.delete(token);
          memberSnapshots.delete(`${token}:${collectionId}`);
          setCollections(current => current.filter(item => (item._id || item.id) !== collectionId));
          Alert.alert('Group deleted', 'The group has been removed from the database.');
        } catch (requestError) {
          Alert.alert('Unable to delete group', requestError.message || 'Please try again.');
        }
      }},
    ]);
  };

  const header = (title, subtitle, backAction, actionLabel, action) => (
    <View style={[styles.header, {paddingTop: insets.top + 10}]}>
      <TouchableOpacity onPress={backAction} style={styles.backButton} accessibilityLabel="Go back"><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
      <View style={styles.headerCenter}><Text style={styles.headerTitle} numberOfLines={1}>{title}</Text><Text style={styles.headerSubtitle}>{subtitle}</Text></View>
      <TouchableOpacity onPress={action} style={styles.headerAction} accessibilityRole="button"><Text style={styles.headerActionText}>{actionLabel}</Text></TouchableOpacity>
    </View>
  );

  if (selected) return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />
    {header(capitalizeFirstWord(selected.name), `${capitalizeFirstWord(selected.type)} GROUP`, () => setSelected(null), showUserForm ? 'Close' : '+ User', () => setShowUserForm(value => !value))}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}><Text style={styles.label}>PRIMARY EMERGENCY NUMBER</Text><Text style={styles.phone}>{selected.emergencyCallNumber}</Text><Text style={styles.muted}>{members.length} users assigned</Text></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        
        {/* ✅ REMOVED: Edit Collection Button and Form */}
        
        {showUserForm ? <InlineUserForm editMode={Boolean(editingUser)} form={userForm} setForm={setUserForm} submitting={submitting} onCancel={() => {setUserForm(EMPTY_USER); setEditingUser(null); setShowUserForm(false);}} onSubmit={submitUser} /> : null}
        <Text style={styles.sectionTitle}>GROUP USERS</Text>
        {memberError && members.length === 0 ? <View style={styles.empty}><Text style={styles.error}>{memberError}</Text><TouchableOpacity onPress={() => openCollection(selected)}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : membersLoading ? <ActivityIndicator color="#E4002B" /> : members.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No users in this group</Text><Text style={styles.muted}>Add a user to this group.</Text></View> : members.map(member => {
          const memberId = member._id || member.id;
          const statusLabel = member.status === 'active' ? 'Active' : 'Inactive';
          return (
            <View key={memberId} style={styles.memberCard}>
              <TouchableOpacity
                style={styles.memberMain}
                onPress={() => onUserDetail?.({...member, name: member.username, phone: member.mobileNumber, email: member.email || 'No email configured', accountStatus: member.status, status: statusLabel, initials: getUserInitials(member.username), joined: member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Date unavailable', color: '#E4002B'})}
              >
                <View style={styles.avatar}><Text style={styles.avatarText}>{getUserInitials(member.username)}</Text></View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.username}</Text>
                  <Text style={styles.memberMeta}>{member.mobileNumber || 'No mobile number'}</Text>
                  <Text style={styles.memberMeta}>{member.email || 'No email configured'}</Text>
                </View>
                <View style={[styles.memberStatusPill, member.status === 'active' ? styles.memberStatusActive : styles.memberStatusInactive]}>
                  <Text style={[styles.memberStatusText, member.status === 'active' ? styles.memberStatusTextActive : styles.memberStatusTextInactive]}>{statusLabel}</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.memberActions}>
                <TouchableOpacity style={styles.memberActionButton} onPress={() => handleCopyCredentials(member)}>
                  <Text style={styles.memberActionText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.memberActionButton} onPress={() => startUserEdit(member)}>
                  <Text style={styles.memberActionText}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.memberActionButton, styles.memberActionDanger]} onPress={() => handleDeleteMember(member)}>
                  <Text style={styles.memberActionTextDanger}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />
    {header('Groups', `${collections.length} GROUPS`, onBack, '+ Add', onAddCollection)}
    <ScrollView contentContainerStyle={styles.content}>
      {loading ? <ActivityIndicator color="#E4002B" /> : error ? <View style={styles.empty}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={loadCollections}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : collections.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No groups yet</Text><Text style={styles.muted}>Create your first group to start managing users.</Text></View> : collections.map(collection => (
        <View key={collection._id} style={styles.collection}>
          <TouchableOpacity style={styles.collectionMain} onPress={() => openCollection(collection)}>
            <View style={styles.collectionIcon}><Text style={styles.collectionIconText}>{capitalizeFirstWord(collection.name).charAt(0)}</Text></View>
            <View style={styles.collectionInfo}><Text style={styles.collectionName}>{capitalizeFirstWord(collection.name)}</Text><Text style={styles.muted}>{collection.name} · {collection.emergencyCallNumber}</Text></View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          <View style={styles.collectionActions}>
            <TouchableOpacity style={styles.collectionActionButton} onPress={() => onEditCollection?.(collection)}><Text style={styles.collectionActionText}>Edit</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.collectionActionButton, styles.collectionActionDanger]} onPress={() => handleDeleteCollection(collection)}><Text style={styles.collectionActionDangerText}>Delete</Text></TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>  </SafeAreaView>;
}

export function InlineUserForm({editMode, form, setForm, submitting, onCancel, onSubmit}) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const update = field => value => setForm(current => ({...current, [field]: field === 'mobileNumber' ? (String(value || '').startsWith('+') ? String(value) : `+${String(value || '')}`) : value}));
  const fields = editMode
    ? [['username', 'Username', 'Username'], ['password', 'New password (optional)', 'New password'], ['mobileNumber', 'Mobile number', 'Mobile number with country code'], ['email', 'Email (optional)', 'Email (optional)']]
    : [['username', 'Username', 'Username'], ['password', 'Password', 'Password'], ['mobileNumber', 'Mobile number', 'Mobile number with country code'], ['email', 'Email (optional)', 'Email (optional)']];
  return <View style={styles.form}>
    <Text style={styles.formTitle}>{editMode ? 'Edit user' : 'Add user'}</Text>
    {fields.map(([field, label, hint]) => field === 'password' ? (
      <View key={field}>
        <View style={styles.passwordInputWrap}>
          <TextInput style={[styles.input, styles.passwordInput]} placeholder={hint || label} placeholderTextColor="#9CA3AF" value={form[field] || ''} onChangeText={update(field)} secureTextEntry={!passwordVisible} autoCapitalize="none" />
          <TouchableOpacity style={styles.passwordToggle} onPress={() => setPasswordVisible(value => !value)} accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}>
            <Icon name={passwordVisible ? 'eyeOff' : 'eye'} size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    ) : (
      <TextInput key={field} style={styles.input} placeholder={hint || label} placeholderTextColor="#9CA3AF" value={form[field] || ''} onChangeText={update(field)} keyboardType={field === 'mobileNumber' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'} autoCapitalize="none" />
    ))}
    <View style={styles.actions}><TouchableOpacity onPress={onCancel} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={onSubmit} disabled={submitting} style={styles.submit}><Text style={styles.submitText}>{submitting ? (editMode ? 'Saving...' : 'Creating...') : (editMode ? 'Save changes' : 'Create user')}</Text></TouchableOpacity></View>
  </View>;
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F7F7F8'}, 
  flex: {flex: 1}, 
  header: {backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8E8EB', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center'}, 
  backButton: {width: 42, height: 42, justifyContent: 'center'}, 
  backIcon: {fontSize: 38, color: '#1A1A1A'}, 
  headerCenter: {flex: 1, alignItems: 'center', paddingHorizontal: 8}, 
  headerTitle: {fontSize: 18, fontWeight: '900', color: '#1A1A1A'}, 
  headerSubtitle: {fontSize: 9, color: '#8B929B', fontWeight: '800', marginTop: 3}, 
  headerAction: {minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center'}, 
  headerActionText: {color: '#E4002B', fontWeight: '900'}, 
  content: {padding: 20, paddingBottom: 40}, 
  collection: {backgroundColor: '#FFF', borderRadius: 14, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB'},
  collectionMain: {flexDirection: 'row', alignItems: 'center'}, 
  collectionIcon: {width: 44, height: 44, borderRadius: 14, backgroundColor: '#FDE5E8', alignItems: 'center', justifyContent: 'center', marginRight: 12}, 
  collectionIconText: {fontSize: 18, fontWeight: '900', color: '#E4002B'}, 
  collectionInfo: {flex: 1}, 
  collectionName: {fontSize: 15, fontWeight: '900', color: '#1A1A1A'}, 
  chevron: {fontSize: 28, color: '#A1A1A6'},
  collectionActions: {flexDirection: 'row', gap: 8, marginTop: 12},
  collectionActionButton: {flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center'},
  collectionActionText: {color: '#1A1A1A', fontWeight: '800', fontSize: 12},
  collectionActionDanger: {backgroundColor: '#FDECEC'},
  collectionActionDangerText: {color: '#B42318', fontWeight: '800', fontSize: 12}, 
  summary: {backgroundColor: '#FFF', padding: 18, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB'}, 
  label: {fontSize: 10, fontWeight: '900', color: '#6B7280', letterSpacing: 1}, 
  phone: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginVertical: 8}, 
  muted: {fontSize: 12, color: '#6B7280'}, 
  sectionTitle: {fontSize: 11, fontWeight: '900', color: '#6B7280', letterSpacing: 1, marginTop: 24, marginBottom: 12}, 
  memberCard: {backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB'}, 
  memberMain: {flexDirection: 'row', alignItems: 'center'}, 
  avatar: {width: 42, height: 42, borderRadius: 21, backgroundColor: '#E4002B', alignItems: 'center', justifyContent: 'center', marginRight: 12}, 
  avatarText: {color: '#FFF', fontWeight: '900'}, 
  memberInfo: {flex: 1, minWidth: 0}, 
  memberName: {fontWeight: '900', color: '#1A1A1A', marginBottom: 3}, 
  memberMeta: {fontSize: 12, color: '#6B7280', marginBottom: 2}, 
  memberStatusPill: {paddingHorizontal: 8, paddingVertical: 6, borderRadius: 999, marginLeft: 10}, 
  memberStatusActive: {backgroundColor: '#E8F7EE'}, 
  memberStatusInactive: {backgroundColor: '#FDECEC'}, 
  memberStatusText: {fontSize: 11, fontWeight: '800'}, 
  memberStatusTextActive: {color: '#178A4B'}, 
  memberStatusTextInactive: {color: '#B42318'}, 
  memberActions: {flexDirection: 'row', marginTop: 12, gap: 8}, 
  memberActionButton: {flex: 1, minHeight: 38, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center'}, 
  memberActionText: {color: '#1A1A1A', fontWeight: '800', fontSize: 12}, 
  memberActionDanger: {backgroundColor: '#FDECEC'}, 
  memberActionTextDanger: {color: '#B42318', fontWeight: '800', fontSize: 12}, 
  active: {color: '#178A4B', fontSize: 11, fontWeight: '900'}, 
  inactive: {color: '#B42318', fontSize: 11, fontWeight: '900'}, 
  empty: {backgroundColor: '#FFF', padding: 26, alignItems: 'center', borderRadius: 14}, 
  emptyTitle: {fontWeight: '900', color: '#1A1A1A', marginBottom: 6}, 
  error: {color: '#B42318', fontWeight: '700', textAlign: 'center', marginBottom: 12}, 
  retry: {color: '#E4002B', fontWeight: '900', marginTop: 12}, 
  // ✅ REMOVED: editButton styles - Edit collection hidden
  form: {backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB'}, 
  formTitle: {fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 12}, 
  input: {height: 50, borderWidth: 1.5, borderColor: '#E1E5EA', borderRadius: 12, paddingHorizontal: 14, marginBottom: 10, color: '#1A1A1A'}, 
  typeRow: {flexDirection: 'row', gap: 6, marginBottom: 12}, 
  typeButton: {flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F1F2F4', alignItems: 'center'}, 
  typeButtonActive: {backgroundColor: '#E4002B'}, 
  typeText: {fontSize: 11, color: '#6B7280', fontWeight: '800'}, 
  typeTextActive: {fontSize: 11, color: '#FFF', fontWeight: '800'}, 
  passwordInputWrap: {position: 'relative'},
  passwordInput: {paddingRight: 52},
  passwordToggle: {position: 'absolute', right: 8, top: 0, bottom: 10, width: 42, alignItems: 'center', justifyContent: 'center'},
  actions: {flexDirection: 'row', gap: 10}, 
  cancel: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F4', borderRadius: 10}, 
  submit: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4002B', borderRadius: 10}, 
  submitText: {color: '#FFF', fontWeight: '900'}
});
