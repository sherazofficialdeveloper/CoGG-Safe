import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {createCollection, createUser} from '../../api/resources';
import Button from '../../components/Button';
import Card from '../../components/Card';
import Header from '../../components/Header';
import Input from '../../components/Input';
import {COLLECTION_TYPES} from '../../constants/collectionTypes';

const EMPTY_USER = {username: '', password: '', mobileNumber: '', email: ''};
function validateUser(user, index, users) {
  const errors = {};
  if (!user.username.trim()) errors.username = 'Username is required.';
  else if (!/^[a-zA-Z0-9._-]{3,50}$/.test(user.username.trim())) errors.username = 'Use 3-50 letters, numbers, dots, underscores or hyphens.';
  if (!user.password) errors.password = 'Password is required.';
  else if (user.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (!/^\+?[0-9]{7,15}$/.test(user.mobileNumber.trim())) errors.mobileNumber = 'Enter a valid mobile number.';
  if (user.email.trim() && !/^\S+@\S+\.\S+$/.test(user.email.trim())) errors.email = 'Enter a valid email address.';
  const duplicateUsername = users.some((item, itemIndex) => itemIndex !== index && item.username.trim().toLowerCase() === user.username.trim().toLowerCase() && user.username.trim());
  const duplicateMobile = users.some((item, itemIndex) => itemIndex !== index && item.mobileNumber.trim() === user.mobileNumber.trim() && user.mobileNumber.trim());
  const duplicateEmail = user.email.trim() && users.some((item, itemIndex) => itemIndex !== index && item.email.trim().toLowerCase() === user.email.trim().toLowerCase());
  if (duplicateUsername) errors.username = 'Usernames must be unique.';
  if (duplicateMobile) errors.mobileNumber = 'Mobile numbers must be unique.';
  if (duplicateEmail) errors.email = 'Email addresses must be unique.';
  return errors;
}

function UserForm({user, index, users, onChange, onRemove, errors}) {
  const fields = [
    ['username', 'Username *', 'default'],
    ['password', 'Password *', 'default'],
    ['mobileNumber', 'Mobile number *', 'phone-pad'],
    ['email', 'Email (optional)', 'email-address'],
  ];
  return (
    <Card style={styles.userForm}>
      <View style={styles.userHeading}>
        <Text style={styles.userTitle}>User {index + 1}</Text>
        {index > 0 ? <TouchableOpacity onPress={onRemove} accessibilityLabel={`Remove user ${index + 1}`}><Text style={styles.removeText}>Remove</Text></TouchableOpacity> : null}
      </View>
      {fields.map(([field, label, keyboardType]) => (
        <Input key={field} label={label.replace(' *', '')} required={label.endsWith(' *')} value={user[field]} onChangeText={value => onChange(field, value)} placeholder={label.replace(' *', '')} keyboardType={keyboardType} autoCapitalize="none" secureTextEntry={field === 'password'} error={errors[field]} />
      ))}
    </Card>
  );
}

export default function AdminCreateCollectionScreen({onBack, onSave, token}) {
  const [name, setName] = useState('Workers');
  const [type, setType] = useState('workers');
  const [emergencyCallNumber, setEmergencyCallNumber] = useState('');
  const [users, setUsers] = useState([{...EMPTY_USER}]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const updateUser = (index, field, value) => setUsers(current => current.map((user, itemIndex) => itemIndex === index ? {...user, [field]: value} : user));
  const addUser = () => setUsers(current => [...current, {...EMPTY_USER}]);
  const removeUser = index => setUsers(current => current.filter((_, itemIndex) => itemIndex !== index));
  const selectType = selectedType => {
    setType(selectedType);
    setName(selectedType === 'other' ? '' : selectedType[0].toUpperCase() + selectedType.slice(1));
  };

  const save = async () => {
    const nextErrors = {};
    if (!name.trim() || name.trim().length < 2) nextErrors.name = 'Collection name must be at least 2 characters.';
    if (!/^\+?[0-9]{3,15}$/.test(emergencyCallNumber.trim())) nextErrors.emergencyCallNumber = 'Enter a valid emergency number.';
    users.forEach((user, index) => { nextErrors[`user-${index}`] = validateUser(user, index, users); });
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.emergencyCallNumber || users.some((_, index) => Object.keys(nextErrors[`user-${index}`]).length)) return;

    setSubmitting(true);
    try {
      const collectionResponse = await createCollection(token, {name: name.trim(), type, emergencyCallNumber: emergencyCallNumber.trim()});
      const collection = collectionResponse.collection;
      let createdUsers = 0;
      try {
        for (const user of users) {
          const payload = {username: user.username.trim(), password: user.password, mobileNumber: user.mobileNumber.trim(), collectionId: collection._id};
          if (user.email.trim()) payload.email = user.email.trim();
          await createUser(token, payload);
          createdUsers += 1;
        }
      } catch (userError) {
        Alert.alert('Collection partially saved', `The collection was created, but ${createdUsers} of ${users.length} users were saved. ${userError.message || 'Please review the collection and try again.'}`);
        return;
      }
      Alert.alert('Collection saved', `${createdUsers} user${createdUsers === 1 ? '' : 's'} added successfully.`);
      onSave?.(collection);
    } catch (requestError) {
      Alert.alert('Unable to save collection', requestError.message || 'Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Header title="Create Collection" subtitle="Collection and members" onBack={onBack} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Input label="Collection / Group name" required value={name} onChangeText={setName} editable={type === 'other'} placeholder="e.g. Warehouse Team" error={errors.name} />
          <Text style={styles.label}>Collection type</Text>
          <View style={styles.typeRow}>{COLLECTION_TYPES.map(item => <Button key={item.value} title={item.label} variant={item.value === type ? 'primary' : 'outline'} onPress={() => selectType(item.value)} style={styles.typeButton} />)}</View>
          <Input label="Emergency call number" required value={emergencyCallNumber} onChangeText={setEmergencyCallNumber} placeholder="15 or +923001234567" keyboardType="phone-pad" error={errors.emergencyCallNumber} />
          <Text style={styles.sectionTitle}>USERS</Text>
          {users.map((user, index) => <UserForm key={index} user={user} index={index} users={users} errors={errors[`user-${index}`] || {}} onChange={(field, value) => updateUser(index, field, value)} onRemove={() => removeUser(index)} />)}
          <Button title="Add User" icon="add" variant="outline" onPress={addUser} disabled={submitting} style={styles.addButton} />
          <Button title="Save Collection" icon="save" loading={submitting} onPress={save} style={styles.saveButton} />
          <Button title="Cancel" variant="ghost" onPress={onBack} disabled={submitting} style={styles.cancelButton} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#F6F7F9'}, flex: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#ECEEF1'},
  backButton: {width: 42, height: 42, justifyContent: 'center'}, backIcon: {fontSize: 36, color: '#1A1A1A'}, headerCenter: {flex: 1, alignItems: 'center'}, headerRight: {width: 42}, headerTitle: {fontSize: 18, fontWeight: '900', color: '#1A1A1A'}, headerSubtitle: {fontSize: 11, color: '#6B7280', marginTop: 3},
  content: {padding: 20, paddingBottom: 40}, label: {fontSize: 11, fontWeight: '800', color: '#4B5563', marginBottom: 7, marginTop: 12}, input: {minHeight: 50, borderWidth: 1, borderColor: '#D9DEE5', borderRadius: 10, backgroundColor: '#FFFFFF', paddingHorizontal: 14, color: '#1A1A1A', fontSize: 14}, inputError: {borderColor: '#B42318'}, errorText: {color: '#B42318', fontSize: 12, marginTop: 5}, typeRow: {flexDirection: 'row', gap: 6, marginBottom: 4}, typeButton: {flex: 1, paddingVertical: 11, borderRadius: 8, backgroundColor: '#E9EDF1', alignItems: 'center'}, typeButtonActive: {backgroundColor: '#E4002B'}, typeText: {fontSize: 11, color: '#52606D', fontWeight: '800'}, typeTextActive: {fontSize: 11, color: '#FFFFFF', fontWeight: '800'}, sectionTitle: {fontSize: 11, fontWeight: '900', letterSpacing: 1, color: '#6B7280', marginTop: 26, marginBottom: 8}, userForm: {backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E1E5EA'}, userHeading: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4}, userTitle: {fontSize: 16, fontWeight: '900', color: '#1A1A1A'}, removeText: {color: '#B42318', fontSize: 12, fontWeight: '800'}, field: {marginTop: 4}, addButton: {borderWidth: 1, borderColor: '#E4002B', borderRadius: 10, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 4}, addButtonText: {color: '#E4002B', fontWeight: '900'}, saveButton: {backgroundColor: '#E4002B', borderRadius: 10, minHeight: 52, justifyContent: 'center', alignItems: 'center', marginTop: 14}, saveText: {color: '#FFFFFF', fontWeight: '900'}, cancelButton: {minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 4}, cancelText: {color: '#4B5563', fontWeight: '800'},
});
