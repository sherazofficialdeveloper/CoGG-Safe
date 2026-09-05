// screens/admin/AdminAddCollectionScreen.js
import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  TextInput,
  SafeAreaView,
} from 'react-native';

import {createCollection} from '../../api/resources';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

const AdminAddCollectionScreen = ({
  onBack,
  onSave,
  onCreated,
  token,
}) => {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('Workers');
  const [customName, setCustomName] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    if (cat === 'Other') {
      setCustomName('');
    }
  };

  const handleSaveCollection = async () => {
    const name = category === 'Other' ? customName.trim() : category;
    if (category === 'Other' && !name) {
      setError('Please enter a custom collection name.');
      return;
    }
    if (!emergencyNumber.trim()) {
      setError('Please enter a primary emergency phone number.');
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const collectionData = await createCollection(token, {
        name,
        type: category.toLowerCase(),
        emergencyCallNumber: emergencyNumber.trim(),
      });
      onCreated?.(collectionData.collection);
      if (onSave) onSave(collectionData.collection);
    } catch (requestError) {
      setError(requestError.message || 'Unable to create collection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F7F9" translucent={true} />

      {/* Header */}
      <View style={[styles.header, {paddingTop: insets.top + 10}]}>
        <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Add Collection</Text>
          <Text style={styles.headerSubtitle}>Configure group & assign members</Text>
        </View>
        <View style={styles.headerRight} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>

        {/* Category Selector */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Collection Category</Text>
          <View style={styles.categoryGrid}>
            {['Family', 'Children', 'Workers', 'Other'].map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryButton,
                  category === cat && styles.categoryButtonActive,
                ]}
                onPress={() => handleCategorySelect(cat)}
                activeOpacity={0.7}>
                <Text style={[
                  styles.categoryText,
                  category === cat && styles.categoryTextActive,
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Collection Name */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Collection Name</Text>
          {category === 'Other' ? (
            <TextInput
              style={styles.nameInput}
              placeholder="Enter custom collection name"
              placeholderTextColor="#9CA3AF"
              value={customName}
              onChangeText={setCustomName}
            />
          ) : (
            <View style={styles.nameFixed}>
              <Text style={styles.nameFixedText}>{category}</Text>
              <View style={styles.autoBadge}>
                <Text style={styles.autoBadgeText}>Auto-assigned</Text>
              </View>
            </View>
          )}
        </View>

        {/* Emergency Number */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Emergency Call Number</Text>
          <TextInput
            style={styles.emergencyInput}
            placeholder="+1 (800) 555-0199"
            placeholderTextColor="#9CA3AF"
            value={emergencyNumber}
            onChangeText={setEmergencyNumber}
            keyboardType="phone-pad"
          />
          <Text style={styles.helperText}>
            Dialed automatically when any member triggers an SOS alert.
          </Text>
        </View>

        {/* Action Buttons */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={onBack}
            activeOpacity={0.7}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.saveButton]}
            onPress={handleSaveCollection}
            disabled={submitting}
            activeOpacity={0.7}>
            <Text style={styles.saveButtonText}>{submitting ? 'Saving...' : 'Save Collection'}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>

    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEEF1',
  },

  backIcon: {
    fontSize: 32,
    color: '#1A1A1A',
    fontWeight: '300',
    width: 40,
  },

  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  headerSubtitle: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },

  headerRight: {
    width: 40,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
  },

  section: {
    marginBottom: 20,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#6B7280',
    letterSpacing: 0.8,
    marginBottom: 8,
  },

  categoryGrid: {
    flexDirection: 'row',
    gap: 8,
  },

  categoryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E6EA',
    alignItems: 'center',
  },

  categoryButtonActive: {
    backgroundColor: '#1A1A1A',
    borderColor: '#1A1A1A',
  },

  categoryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },

  categoryTextActive: {
    color: '#FFFFFF',
  },

  nameInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E6EA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  nameFixed: {
    backgroundColor: '#F5F6F8',
    borderWidth: 1.5,
    borderColor: '#E4E6EA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  nameFixedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  autoBadge: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E4E6EA',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },

  autoBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#6B7280',
  },

  emergencyInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E6EA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#1A1A1A',
  },

  helperText: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 6,
    fontWeight: '500',
  },

  usersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  addUserLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },

  addUserLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E4002B',
  },

  usersList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E4E6EA',
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
  },

  emptyUsers: {
    paddingVertical: 20,
    alignItems: 'center',
  },

  emptyUsersText: {
    fontSize: 12,
    color: '#9A9A9F',
  },

  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F2',
  },

  userLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  userAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },

  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  userInfo: {
    flex: 1,
  },

  userName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1A1A1A',
  },

  userDetails: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },

  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E8EAED',
  },

  removeButtonText: {
    fontSize: 12,
    color: '#6B7280',
  },

  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },

  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },

  cancelButton: {
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: '#E4E6EA',
  },

  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },

  saveButton: {
    backgroundColor: '#1A1A1A',
  },

  saveButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  errorText: {
    color: '#B42318',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
});

export default AdminAddCollectionScreen;