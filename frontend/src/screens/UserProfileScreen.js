// UserProfileScreen.js
import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  TextInput,
} from 'react-native';
import Icon from '../components/Icon';
import {getCurrentUser} from '../api/auth';
import {updateMyProfile} from '../api/resources';

const UserProfileScreen = ({
  user,
  onLogout,
  onBack,
  token,
  onUserUpdated,
}) => {
  const [profile, setProfile] = useState(user);
  const [offlineSmsEnabled, setOfflineSmsEnabled] = useState(true);
  const [dailyAlarmEnabled, setDailyAlarmEnabled] = useState(true);
  const defaultEmergencyMessage = profile?.username ? `I am ${profile.username}, I may be in danger.` : '';
  const [emergencyMessage, setEmergencyMessage] = useState(profile?.emergencyMessage || defaultEmergencyMessage);

  const [isEditingTemplate, setIsEditingTemplate] = useState(false);
  const [tempTemplate, setTempTemplate] = useState(emergencyMessage);

  useEffect(() => {
    let mounted = true;
    getCurrentUser(token)
      .then(result => {
        if (!mounted) return;
        const currentUser = {...result.user, collection: result.collection || result.user?.collection || null};
        setProfile(currentUser);
        setEmergencyMessage(currentUser.emergencyMessage || (currentUser.username ? `I am ${currentUser.username}, I may be in danger.` : ''));
        onUserUpdated?.(currentUser);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [token, onUserUpdated]);

  const handleSaveTemplate = async () => {
    try {
      const result = await updateMyProfile(token, {emergencyMessage: tempTemplate});
      const updatedUser = {...profile, ...result.user};
      const updatedDefault = updatedUser.username ? `I am ${updatedUser.username}, I may be in danger.` : '';
      setProfile(updatedUser);
      setEmergencyMessage(updatedUser.emergencyMessage || updatedDefault);
      onUserUpdated?.(updatedUser);
      setIsEditingTemplate(false);
      Alert.alert('Success', 'Message template updated successfully.');
    } catch (error) {
      Alert.alert('Unable to save message', error.message || 'Please try again.');
    }
  };

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}>

      {/* ================= BACK BUTTON ================= */}
      <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.8}>
        <Icon name="back" size={20} color="#E4002B" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      {/* ================= PROFILE CARD ================= */}
      <View style={styles.profileCard}>
        <View style={styles.profileAccent} />

        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.username ? profile.username[0].toUpperCase() : 'U'}
          </Text>
        </View>

        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.username || 'User'}</Text>
          <Text style={styles.profileRole}>{profile?.role || 'user'} · {profile?.status || 'unknown'}</Text>
          <Text style={styles.profileEmail} numberOfLines={2}>
            {profile?.email || 'Email not configured'} · {profile?.mobileNumber || 'Mobile not configured'}
          </Text>
          <Text style={styles.profileEmail}>{profile?.collection?.name || 'Collection not assigned'}</Text>
        </View>
      </View>

      {/* ================= SECTION TITLE ================= */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>SYSTEM PREFERENCES</Text>
      </View>

      {/* ================= OFFLINE SMS ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>
          <Switch
            value={offlineSmsEnabled}
            onValueChange={setOfflineSmsEnabled}
            trackColor={{false: '#D9DCE1', true: '#E4002B'}}
            thumbColor="#FFFFFF"
            style={styles.switch}
          />
        </View>

        <Text style={styles.settingTitle}>Offline SMS Dispatch</Text>
        <Text style={styles.settingDescription}>
          Force SMS broadcast if cellular data fails.
        </Text>
      </View>

      {/* ================= EMERGENCY MESSAGE ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>

          <TouchableOpacity
            style={styles.editButtonContainer}
            onPress={() => {
              if (isEditingTemplate) {
                handleSaveTemplate();
              } else {
                setTempTemplate(emergencyMessage);
                setIsEditingTemplate(true);
              }
            }}
            activeOpacity={0.75}>
            <Text style={styles.editButton}>
              {isEditingTemplate ? 'SAVE' : 'EDIT'}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.settingTitle}>Emergency SMS Template</Text>
        <Text style={styles.settingDescription}>
          Dynamic payload fields append automatically during transmission.
        </Text>

        {isEditingTemplate ? (
          <View style={styles.editContainer}>
            <TextInput
              style={styles.templateInput}
              value={tempTemplate}
              onChangeText={setTempTemplate}
              multiline
              numberOfLines={4}
              placeholder="Enter your emergency message..."
              placeholderTextColor="#9CA3AF"
            />

            <View style={styles.editActions}>
              <TouchableOpacity
                style={styles.cancelButtonContainer}
                onPress={() => setIsEditingTemplate(false)}
                activeOpacity={0.7}>
                <Text style={styles.cancelButton}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveTemplate}
                activeOpacity={0.8}>
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.templatePreview}
            onPress={() => {
              setTempTemplate(emergencyMessage);
              setIsEditingTemplate(true);
            }}
            activeOpacity={0.75}>
            <Text style={styles.templatePreviewText}>
              "{emergencyMessage}"
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ================= DAILY SYSTEM TEST ================= */}
      <View style={styles.settingCard}>
        <View style={styles.cardAccent} />

        <View style={styles.settingTopRow}>
          <View style={styles.settingIcon}>
            <Icon name="notifications" size={20} color="#E4002B" />
          </View>

          <Switch
            value={dailyAlarmEnabled}
            onValueChange={setDailyAlarmEnabled}
            trackColor={{false: '#D9DCE1', true: '#E4002B'}}
            thumbColor="#FFFFFF"
            style={styles.switch}
          />
        </View>

        <Text style={styles.settingTitle}>Daily System Test Alarms</Text>
        <Text style={styles.settingDescription}>
          Test sirens and system dispatch capabilities daily.
        </Text>
      </View>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 30,
  },

  /* ================= BACK BUTTON ================= */
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 22,
    backgroundColor: '#FFF0F2',
    borderWidth: 1,
    borderColor: '#FFD5DA',
    marginBottom: 16,
  },

  backIcon: {
    fontSize: 16,
    color: '#E4002B',
    fontWeight: '600',
    marginRight: 6,
  },

  backText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E4002B',
    letterSpacing: 0.3,
  },

  /* ================= PROFILE ================= */
  profileCard: {
    minHeight: 125,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    borderRadius: 24,
    padding: 20,
    paddingLeft: 24,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },

  profileAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 6,
    backgroundColor: '#E4002B',
  },

  avatar: {
    width: 74,
    height: 74,
    borderRadius: 22,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    shadowColor: '#E4002B',
    shadowOffset: {width: 0, height: 5},
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 29,
    fontWeight: '900',
  },

  profileInfo: {
    flex: 1,
    minWidth: 0,
  },

  profileName: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 29,
  },

  profileRole: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E4002B',
    marginTop: 5,
  },

  profileEmail: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7B818C',
    marginTop: 7,
    lineHeight: 18,
  },

  /* ================= SECTION ================= */
  sectionHeader: {
    marginBottom: 14,
  },

  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#7B818C',
    letterSpacing: 1.6,
  },

  /* ================= SETTING CARD ================= */
  settingCard: {
    minHeight: 165,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E3E6EA',
    borderRadius: 24,
    padding: 20,
    paddingLeft: 24,
    marginBottom: 14,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.045,
    shadowRadius: 10,
    elevation: 2,
  },

  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: '#E5E7EB',
  },

  settingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 17,
  },

  settingIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: '#F5F6F8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  settingIconText: {
    fontSize: 26,
  },

  settingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    lineHeight: 24,
  },

  settingDescription: {
    fontSize: 13,
    fontWeight: '700',
    color: '#747B86',
    marginTop: 7,
    lineHeight: 20,
  },

  switch: {
    transform: [{scaleX: 1.05}, {scaleY: 1.05}],
  },

  editButtonContainer: {
    minWidth: 62,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFF0F2',
    borderWidth: 1,
    borderColor: '#FFD9DE',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },

  editButton: {
    fontSize: 10,
    fontWeight: '900',
    color: '#E4002B',
    letterSpacing: 1,
  },

  templatePreview: {
    marginTop: 16,
    backgroundColor: '#F7F8FA',
    borderWidth: 1.5,
    borderColor: '#E2E5E9',
    borderRadius: 16,
    padding: 16,
    minHeight: 72,
  },

  templatePreviewText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5F6672',
    lineHeight: 21,
  },

  editContainer: {
    marginTop: 16,
  },

  templateInput: {
    backgroundColor: '#F7F8FA',
    borderWidth: 1.5,
    borderColor: '#E2E5E9',
    borderRadius: 16,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    minHeight: 110,
    textAlignVertical: 'top',
  },

  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 12,
  },

  cancelButtonContainer: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginRight: 8,
  },

  cancelButton: {
    fontSize: 13,
    fontWeight: '800',
    color: '#747B86',
  },

  saveButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: '#E4002B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
});

export default UserProfileScreen;