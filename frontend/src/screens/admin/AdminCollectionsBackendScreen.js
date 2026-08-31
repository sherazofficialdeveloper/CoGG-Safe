import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {createUser, listCollectionUsers, listCollections, updateCollection} from '../../api/resources';

const EMPTY_USER = {username: '', mobileNumber: '', email: '', password: ''};
const TYPES = ['family', 'children', 'workers', 'other'];

export default function AdminCollectionsBackendScreen({token, onBack, onAddCollection, onUserDetail}) {
  const insets = useSafeAreaInsets();
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

  const openCollection = async collection => {
    setSelected(collection);
    setEditForm({...collection});
    setMembersLoading(true);
    setError('');
    try {
      const response = await listCollectionUsers(token, collection._id);
      setMembers(response.users || []);
    } catch (requestError) {
      setError('Unable to load collection users.');
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
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
      await createUser(token, payload);
      setUserForm(EMPTY_USER);
      setShowUserForm(false);
      await openCollection(selected);
      Alert.alert('User created', 'The user can now sign in with these credentials.');
    } catch (requestError) {
      setError(requestError.message || 'Unable to create user.');
    } finally {
      setSubmitting(false);
    }
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
    {header(selected.name, `${selected.type.toUpperCase()} COLLECTION`, () => setSelected(null), showUserForm ? 'Close' : '+ User', () => setShowUserForm(value => !value))}
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.summary}><Text style={styles.label}>PRIMARY EMERGENCY NUMBER</Text><Text style={styles.phone}>{selected.emergencyCallNumber}</Text><Text style={styles.muted}>{members.length} users assigned</Text></View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {showEditForm ? <View style={styles.form}><Text style={styles.formTitle}>Edit collection</Text><TextInput style={styles.input} value={editForm?.name || ''} onChangeText={value => setEditForm(current => ({...current, name: value}))} placeholder="Collection name" /><TextInput style={styles.input} value={editForm?.emergencyCallNumber || ''} onChangeText={value => setEditForm(current => ({...current, emergencyCallNumber: value}))} placeholder="Emergency number" keyboardType="phone-pad" /><View style={styles.typeRow}>{TYPES.map(type => <TouchableOpacity key={type} onPress={() => setEditForm(current => ({...current, type}))} style={[styles.typeButton, editForm?.type === type && styles.typeButtonActive]}><Text style={editForm?.type === type ? styles.typeTextActive : styles.typeText}>{type}</Text></TouchableOpacity>)}</View><TouchableOpacity disabled={submitting} onPress={saveCollection} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Updating...' : 'Save changes'}</Text></TouchableOpacity></View> : <TouchableOpacity onPress={() => setShowEditForm(true)} style={styles.editButton}><Text style={styles.editButtonText}>Edit collection</Text></TouchableOpacity>}
        {showUserForm ? <InlineUserForm form={userForm} setForm={setUserForm} submitting={submitting} onCancel={() => {setUserForm(EMPTY_USER); setShowUserForm(false);}} onSubmit={submitUser} /> : null}
        <Text style={styles.sectionTitle}>COLLECTION USERS</Text>
        {membersLoading ? <ActivityIndicator color="#E4002B" /> : members.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No users in this collection</Text><Text style={styles.muted}>Add a user to this collection.</Text></View> : members.map(member => <TouchableOpacity key={member._id} style={styles.member} onPress={() => onUserDetail?.({...member, name: member.username, phone: member.mobileNumber, email: member.email || 'No email configured', accountStatus: member.status, status: member.status === 'active' ? 'Active' : 'Inactive', initials: member.username.slice(0, 2).toUpperCase(), joined: member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'Date unavailable', color: '#E4002B'})}><View style={styles.avatar}><Text style={styles.avatarText}>{member.username.slice(0, 2).toUpperCase()}</Text></View><View style={styles.memberInfo}><Text style={styles.memberName}>{member.username}</Text><Text style={styles.muted}>{member.mobileNumber}{member.email ? ` · ${member.email}` : ''}</Text></View><Text style={member.status === 'active' ? styles.active : styles.inactive}>{member.status}</Text></TouchableOpacity>)}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;

  return <SafeAreaView style={styles.container}>
    <StatusBar barStyle="dark-content" backgroundColor="#F7F7F8" />
    {header('Collections', `${collections.length} COLLECTIONS`, onBack, '+ Add', onAddCollection)}
    <ScrollView contentContainerStyle={styles.content}>{loading ? <ActivityIndicator color="#E4002B" /> : error ? <View style={styles.empty}><Text style={styles.error}>{error}</Text><TouchableOpacity onPress={loadCollections}><Text style={styles.retry}>Retry</Text></TouchableOpacity></View> : collections.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>No collections yet</Text><Text style={styles.muted}>Create your first collection to start managing users.</Text></View> : collections.map(collection => <TouchableOpacity key={collection._id} style={styles.collection} onPress={() => openCollection(collection)}><View style={styles.collectionIcon}><Text style={styles.collectionIconText}>{collection.name[0]}</Text></View><View style={styles.memberInfo}><Text style={styles.collectionName}>{collection.name}</Text><Text style={styles.muted}>{collection.type} · {collection.emergencyCallNumber}</Text></View><Text style={styles.chevron}>›</Text></TouchableOpacity>)}</ScrollView>
  </SafeAreaView>;
}

function InlineUserForm({form, setForm, submitting, onCancel, onSubmit}) {
  const update = field => value => setForm(current => ({...current, [field]: value}));
  return <View style={styles.form}><Text style={styles.formTitle}>Add user</Text>{[['username', 'Username *'], ['password', 'Password *'], ['mobileNumber', 'Mobile number *'], ['email', 'Email (optional)']].map(([field, label]) => <TextInput key={field} style={styles.input} placeholder={label} value={form[field]} onChangeText={update(field)} secureTextEntry={field === 'password'} keyboardType={field === 'mobileNumber' ? 'phone-pad' : field === 'email' ? 'email-address' : 'default'} autoCapitalize="none" />)}<View style={styles.actions}><TouchableOpacity onPress={onCancel} style={styles.cancel}><Text>Cancel</Text></TouchableOpacity><TouchableOpacity onPress={onSubmit} disabled={submitting} style={styles.submit}><Text style={styles.submitText}>{submitting ? 'Creating...' : 'Create user'}</Text></TouchableOpacity></View></View>;
}

const styles = StyleSheet.create({container: {flex: 1, backgroundColor: '#F7F7F8'}, flex: {flex: 1}, header: {backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E8E8EB', paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center'}, backButton: {width: 42, height: 42, justifyContent: 'center'}, backIcon: {fontSize: 38, color: '#1A1A1A'}, headerCenter: {flex: 1, alignItems: 'center', paddingHorizontal: 8}, headerTitle: {fontSize: 18, fontWeight: '900', color: '#1A1A1A'}, headerSubtitle: {fontSize: 9, color: '#8B929B', fontWeight: '800', marginTop: 3}, headerAction: {minWidth: 58, minHeight: 42, alignItems: 'center', justifyContent: 'center'}, headerActionText: {color: '#E4002B', fontWeight: '900'}, content: {padding: 20, paddingBottom: 40}, collection: {backgroundColor: '#FFF', borderRadius: 14, padding: 15, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB'}, collectionIcon: {width: 44, height: 44, borderRadius: 14, backgroundColor: '#FDE5E8', alignItems: 'center', justifyContent: 'center', marginRight: 12}, collectionIconText: {fontSize: 18, fontWeight: '900', color: '#E4002B'}, collectionName: {fontSize: 15, fontWeight: '900', color: '#1A1A1A'}, memberInfo: {flex: 1}, chevron: {fontSize: 28, color: '#A1A1A6'}, summary: {backgroundColor: '#FFF', padding: 18, borderRadius: 16, marginBottom: 18, borderWidth: 1, borderColor: '#E5E7EB'}, label: {fontSize: 10, fontWeight: '900', color: '#6B7280', letterSpacing: 1}, phone: {fontSize: 22, fontWeight: '900', color: '#1A1A1A', marginVertical: 8}, muted: {fontSize: 12, color: '#6B7280'}, sectionTitle: {fontSize: 11, fontWeight: '900', color: '#6B7280', letterSpacing: 1, marginTop: 24, marginBottom: 12}, member: {backgroundColor: '#FFF', padding: 14, marginBottom: 2, flexDirection: 'row', alignItems: 'center', borderRadius: 10}, avatar: {width: 38, height: 38, borderRadius: 19, backgroundColor: '#E4002B', alignItems: 'center', justifyContent: 'center', marginRight: 11}, avatarText: {color: '#FFF', fontWeight: '900'}, memberName: {fontWeight: '900', color: '#1A1A1A', marginBottom: 3}, active: {color: '#178A4B', fontSize: 11, fontWeight: '900'}, inactive: {color: '#B42318', fontSize: 11, fontWeight: '900'}, empty: {backgroundColor: '#FFF', padding: 26, alignItems: 'center', borderRadius: 14}, emptyTitle: {fontWeight: '900', color: '#1A1A1A', marginBottom: 6}, error: {color: '#B42318', fontWeight: '700', textAlign: 'center', marginBottom: 12}, retry: {color: '#E4002B', fontWeight: '900', marginTop: 12}, editButton: {backgroundColor: '#1A1A1A', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12}, editButtonText: {color: '#FFF', fontWeight: '900'}, form: {backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB'}, formTitle: {fontSize: 16, fontWeight: '900', color: '#1A1A1A', marginBottom: 12}, input: {height: 50, borderWidth: 1.5, borderColor: '#E1E5EA', borderRadius: 12, paddingHorizontal: 14, marginBottom: 10, color: '#1A1A1A'}, typeRow: {flexDirection: 'row', gap: 6, marginBottom: 12}, typeButton: {flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: '#F1F2F4', alignItems: 'center'}, typeButtonActive: {backgroundColor: '#E4002B'}, typeText: {fontSize: 11, color: '#6B7280', fontWeight: '800'}, typeTextActive: {fontSize: 11, color: '#FFF', fontWeight: '800'}, actions: {flexDirection: 'row', gap: 10}, cancel: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F2F4', borderRadius: 10}, submit: {flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E4002B', borderRadius: 10}, submitText: {color: '#FFF', fontWeight: '900'}});
