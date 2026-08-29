import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, BackHandler, Clipboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {createUser, deleteUser, listCollectionUsers, listCollections, setUserStatus, updateCollection} from '../../api/resources';
import Button from '../../components/Button';
import Header from '../../components/Header';
import Input from '../../components/Input';
import {COLLECTION_TYPES} from '../../constants/collectionTypes';

const EMPTY_USER = {username: '', mobileNumber: '', email: '', password: ''};
export default function AdminCollectionsBackendScreen({token, onBack, onAddCollection, onUserDetail}) {
  const [collections, setCollections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [error, setError] = useState('');
  const [showUserForm, setShowUserForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [editForm, setEditForm] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [credentialMap, setCredentialMap] = useState({});

  const loadCollections = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await listCollections(token);
      setCollections(response.collections || []);
    } catch (requestError) {
      setError('Unable to load collections. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadCollections(); }, [loadCollections]);

  useEffect(() => {
    if (!selected) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelected(null);
      setShowUserForm(false);
      return true;
    });
    return () => subscription.remove();
  }, [selected]);

  const loadMembers = useCallback(async collectionId => {
    setMembersLoading(true);
    try {
      const response = await listCollectionUsers(token, collectionId, {limit: 100});
      setMembers(response.users || []);
    } catch (requestError) {
      setMembers([]);
      setError('Unable to load collection users.');
    } finally {
      setMembersLoading(false);
    }
  }, [token]);

  const openCollection = async collection => {
    setSelected(collection);
    setEditForm({...collection});
    setMembersLoading(true);
    setError('');
    await loadMembers(collection._id);
  };

  const saveCollection = async () => {
    if (!editForm?.name?.trim() || !editForm?.emergencyCallNumber?.trim()) {
      setError('Collection name and emergency number are required.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await updateCollection(token, selected._id, {
        name: editForm.name.trim(),
        type: editForm.type,
        emergencyCallNumber: editForm.emergencyCallNumber.trim(),
      });
      setSelected(response.collection);
      setEditForm(response.collection);
      setCollections(items => items.map(item => item._id === response.collection._id ? response.collection : item));
      setShowEditForm(false);
    } catch (requestError) {
      setError(requestError.message || 'Unable to update collection.');
    } finally {
      setSubmitting(false);
    }
  };

  const submitUser = async () => {
    const payload = {username: userForm.username.trim(), mobileNumber: userForm.mobileNumber.trim(), password: userForm.password, collectionId: selected._id};
    if (userForm.email.trim()) payload.email = userForm.email.trim();
    if (!payload.username || !payload.mobileNumber || !payload.password) {
      setError('Username, mobile number, and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await createUser(token, payload);
      const createdUser = response?.user || null;
      const createdPassword = payload.password;

      if (createdUser?._id) {
        setCredentialMap(current => ({...current, [createdUser._id]: createdPassword}));
      }

      setUserForm(EMPTY_USER);
      setShowUserForm(false);
      await loadMembers(selected._id);
      Alert.alert('User created', 'The user can now sign in with these credentials.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = member => {
    const active = member.status === 'active';
    Alert.alert(active ? 'Deactivate user?' : 'Activate user?', `${member.username} will ${active ? 'no longer be able to sign in.' : 'be able to sign in again.'}`, [
      {text: 'Cancel', style: 'cancel'},
      {text: active ? 'Deactivate' : 'Activate', onPress: async () => {
        setSubmitting(true);
        try {
          const response = await setUserStatus(token, member._id, !active);
          setMembers(items => items.map(item => item._id === member._id ? response.user : item));
        } catch (requestError) {
          setError(requestError.message || 'Unable to update user status.');
        } finally {
          setSubmitting(false);
        }
      }},
    ]);
  };

  const removeUser = member => Alert.alert('Delete this user permanently?', member.username, [
    {text: 'Cancel', style: 'cancel'},
    {text: 'Delete', style: 'destructive', onPress: async () => {
      setSubmitting(true);
      try {
        await deleteUser(token, member._id);
        setMembers(items => items.filter(item => item._id !== member._id));
        setCredentialMap(current => {
          const next = {...current};
          delete next[member._id];
          return next;
        });
      } catch (requestError) {
        setError(requestError.message || 'Unable to delete user.');
      } finally {
        setSubmitting(false);
      }
    }},
  ]);

  const copyCredentials = async member => {
    const password = credentialMap[member._id];

    if (!password) {
      Alert.alert(
        'Credentials unavailable',
        'The backend never returns plaintext passwords because they are stored as a secure bcrypt hash. Copy is only available for the password entered when the account was created in this session.',
      );
      return;
    }

    try {
      await Clipboard.setString(`Username: ${member.username}\nPassword: ${password}`);
      Alert.alert('Credentials copied', 'The username and password were copied to your clipboard.');
    } catch (error) {
      Alert.alert('Unable to copy credentials', 'Please try again.');
    }
  };

  const header = (title, subtitle, backAction, actionLabel, action) => <Header title={title} subtitle={subtitle} onBack={backAction} right={<Button title={actionLabel} variant="ghost" onPress={action} style={styles.headerAction} textStyle={styles.headerActionText} />} />;

  if (selected) return <SafeAreaView style={styles.container}>
    {header(selected.name, `${selected.type.toUpperCase()} COLLECTION`, () => setSelected(null), showUserForm ? 'Close' : '+ User', () => setShowUserForm(value => !value))}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}><Text style={styles.label}>PRIMARY EMERGENCY NUMBER</Text><Text style={styles.phone}>{selected.emergencyCallNumber}</Text><Text style={styles.muted}>{members.length} users assigned</Text></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {showEditForm ? <View style={styles.form}><Text style={styles.formTitle}>Edit collection</Text><Input label="Collection name" value={editForm?.name || ''} onChangeText={value => setEditForm(current => ({...current, name: value}))} editable={editForm?.type === 'other'} placeholder="Collection name" /><Input label="Emergency number" value={editForm?.emergencyCallNumber || ''} onChangeText={value => setEditForm(current => ({...current, emergencyCallNumber: value}))} placeholder="Emergency number" keyboardType="phone-pad" /><View style={styles.typeRow}>{COLLECTION_TYPES.map(item => <Button key={item.value} title={item.label} variant={editForm?.type === item.value ? 'primary' : 'outline'} onPress={() => setEditForm(current => ({...current, type: item.value, name: item.value === 'other' ? current.name : item.label}))} style={styles.typeButton} />)}</View><Button title="Save changes" icon="save" loading={submitting} onPress={saveCollection} style={styles.submit} /></View> : <Button title="Edit collection" icon="edit" variant="secondary" onPress={() => setShowEditForm(true)} style={styles.editButton} />}
        {showUserForm ? <InlineUserForm form={userForm} setForm={setUserForm} submitting={submitting} onCancel={() => {setUserForm(EMPTY_USER); setShowUserForm(false);}} onSubmit={submitUser} /> : null}
        <Text style={styles.sectionTitle}>COLLECTION USERS</Text>
        {membersLoading ? <ActivityIndicator color="#E4002B" /> : members.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No users in this collection</Text><Text style={styles.muted}>Add a user to this collection.</Text></View> : members.map(member => <TouchableOpacity key={member._id} style={styles.member} onPress={() => onUserDetail?.({...member, name: member.username, phone: member.mobileNumber, email: member.email || 'No email configured', accountStatus: member.status, status: member.status === 'active' ? 'Active' : 'Inactive', initials: member.username.slice(0, 2).toUpperCase(), joined: member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Date unavailable', color: '#E4002B'})}><View style={styles.avatar}><Text style={styles.avatarText}>{member.username.slice(0, 2).toUpperCase()}</Text></View><View style={styles.memberInfo}><Text style={styles.memberName}>{member.username}</Text><Text style={styles.muted}>{member.mobileNumber}{member.email ? ` · ${member.email}` : ''}</Text><Text style={member.status === 'active' ? styles.active : styles.inactive}>{member.status === 'active' ? 'Active' : 'Inactive'}</Text><View style={styles.memberActions}><TouchableOpacity disabled={submitting} onPress={() => updateStatus(member)}><Text style={styles.actionText}>{member.status === 'active' ? 'Deactivate' : 'Activate'}</Text></TouchableOpacity><TouchableOpacity disabled={submitting} onPress={() => removeUser(member)}><Text style={styles.deleteText}>Delete</Text></TouchableOpacity><TouchableOpacity onPress={() => copyCredentials(member)}><Text style={styles.actionText}>Copy credentials</Text></TouchableOpacity></View></View></TouchableOpacity>)}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    {header('Collections', `${collections.length} COLLECTIONS`, onBack, '+ Add', onAddCollection)}
    <ScrollView contentContainerStyle={styles.content}>{loading ? <ActivityIndicator color="#E4002B" /> : error ? <View style={styles.empty}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={loadCollections}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : collections.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No collections yet</Text><Text style={styles.muted}>Create your first collection to start managing users.</Text></View> : collections.map(collection => <TouchableOpacity key={collection._id} style={styles.collection} onPress={() => openCollection(collection)}><View style={styles.collectionIcon}><Text style={styles.collectionIconText}>{collection.name[0]}</Text></View><View style={styles.memberInfo}><Text style={styles.collectionName}>{collection.name}</Text><Text style={styles.muted}>{collection.type} · {collection.emergencyCallNumber}</Text><Text style={styles.muted}>{collection.userCount || 0} users</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}</ScrollView>
  </SafeAreaView>;
}

function InlineUserForm({form, setForm, submitting, onCancel, onSubmit}) {
  const update = field => value => setForm(current => ({...current, [field]: value}));
  return <View style={styles.form}><Text style={styles.formTitle}>Add user</Text>{[['username', 'Username *'], ['password', 'Password *'], ['mobileNumber', 'Mobile number *'], ['email', 'Email (optional)']].map(([field, label]) => <Input key={field} label={label.replace(' *', '')} required={label.endsWith(' *')} placeholder={label.replace(' *', '')} value={form[field]} onChangeText={update(field)} secureTextEntry={field === 'password'} keyboardType={field === 'mobileNumber' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'} autoCapitalize="none" />)}<View style={styles.actions}><Button title="Cancel" variant="ghost" onPress={onCancel} style={styles.cancel} /><Button title="Create user" loading={submitting} onPress={onSubmit} style={styles.submit} /></View></View>;
}

const styles = StyleSheet.create({container: {flex: 1, backgroundColor: '#F7F7F8'}, flex: {flex: 1}, header: {backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8E8EB', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center'}, backButton: {width: 42, height: 42, justifyContent: 'center'}, backIcon: {fontSize: 38, color: '#1A1A1A'}, headerCenter: {flex: 1, alignItems: 'center', paddingHorizontal: 8}, headerTitle: {fontSize: 18, fontWeight: '900', color: '#1A1A1A'}, headerSubtitle: {fontSize: 9, color: '#8B929B', fontWeight: '800', marginTop: 3}, headerAction: {minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center'}, headerActionText: {color: '#E4002B', fontWeight: '900'}, content: {padding: 20, paddingBottom: 40}, collection: {backgroundColor: '#FFF', borderRadius: 14, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB'}, collectionIcon: {width: 44, height: 44, borderRadius: 14, backgroundColor: '#FDE5E8', alignItems: 'center', justifyContent: 'center', marginRight: 12}, collectionIconText: {fontSize: 18, fontWeight: '900', color: '#E4002B'}, collectionName: {fontSize: 15, fontWeight: '900', color: '#1A1A1A'}, memberInfo: {flex: 1}, chevron: {fontSize: 28, color: '#A1A1A6'}, summary: {backgroundColor: '#FFF', padding: 18, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB'}, label: {fontSize: 10, fontWeight: '900', color: '#6B7280', letterSpacing: 1}, phone: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginVertical: 8}, muted: {fontSize: 12, color: '#6B7280'}, sectionTitle: {fontSize: 11, fontWeight: '900', color: '#6B7280', letterSpacing: 1, marginTop: 24, marginBottom: 12}, member: {backgroundColor: '#FFF', padding: 14, marginBottom: 2, flexDirection: 'row', alignItems: 'flex-start', borderRadius: 10}, avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#E4002B', alignItems: 'center', justifyContent: 'center', marginRight: 11}, avatarText: {color: '#FFF', fontWeight: '900'}, memberName: {fontWeight: '900', color: '#1A1A1A', marginBottom: 3}, active: {color: '#178A4B', fontSize: 11, fontWeight: '900', marginTop: 5}, inactive: {color: '#B42318', fontSize: 11, fontWeight: '900', marginTop: 5}, memberActions: {flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10}, actionText: {color: '#1A5FB4', fontSize: 11, fontWeight: '800'}, deleteText: {color: '#B42318', fontSize: 11, fontWeight: '800'}, empty: {backgroundColor: '#FFF', padding: 26, alignItems: 'center', borderRadius: 14}, emptyTitle: {fontWeight: '900', color: '#1A1A1A', marginBottom: 6}, error: {color: '#B42318', fontWeight: '700', textAlign: 'center', marginBottom: 12}, retry: {color: '#E4002B', fontWeight: '900', marginTop: 12}, editButton: {backgroundColor: '#1A1A1A', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12}, editButtonText: {color: '#FFF', fontWeight: '900'}, form: {backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB'}, formTitle: {fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 12}, input: {height: 50, borderWidth: 1.5, borderColor: '#E1E5EA', borderRadius: 12, paddingHorizontal: 14, marginBottom: 10, color: '#1A1A1A'}, typeRow: {flexDirection: 'row', gap: 6, marginBottom: 12}, typeButton: {flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F1F2F4', alignItems: 'center'}, typeButtonActive: {backgroundColor: '#E4002B'}, typeText: {fontSize: 11, color: '#6B7280', fontWeight: '800'}, typeTextActive: {fontSize: 11, color: '#FFF', fontWeight: '800'}, actions: {flexDirection: 'row', gap: 10}, cancel: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F4', borderRadius: 10}, submit: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4002B', borderRadius: 10}, submitText: {color: '#FFF', fontWeight: '900'}});
