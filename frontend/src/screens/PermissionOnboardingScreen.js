import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from '../components/Icon';
import {
  checkSosPermissions,
  createInitialSosPermissionState,
  markPermissionOnboardingComplete,
  markPermissionOnboardingSkipped,
  openSosPermissionSettings,
  requestRequiredPermissions,
  REQUIRED_PERMISSIONS,
  subscribeToPermissionChanges,
} from '../permissions/sosPermissions';

export default function PermissionOnboardingScreen({onComplete, onDecline}) {
  const [permissionState, setPermissionState] = useState(createInitialSosPermissionState);
  const [requesting, setRequesting] = useState(false);

  const refresh = useCallback(async () => {
    const nextState = await checkSosPermissions();
    setPermissionState(nextState);
    if (nextState.allRequiredGranted) {
      await markPermissionOnboardingComplete();
      onComplete?.();
    }
  }, [onComplete]);

  useEffect(() => {
    refresh();
    return subscribeToPermissionChanges(refresh);
  }, [refresh]);

  const requestPermissions = async () => {
    setRequesting(true);
    const nextState = await requestRequiredPermissions();
    setPermissionState(nextState);
    setRequesting(false);
    if (nextState.allRequiredGranted) {
      await markPermissionOnboardingComplete();
      onComplete?.();
    }
  };

  const decline = async () => {
    await markPermissionOnboardingSkipped();
    onDecline?.();
  };

  const blocked = !permissionState.canRequest && !permissionState.allRequiredGranted;
  const statusFor = key => permissionState[key] === 'granted' ? 'Granted' : permissionState[key] === 'never_ask_again' ? 'Blocked' : 'Required';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.brandMark}><Icon name="sos" size={30} color="#FFFFFF" /></View>
      <Text style={styles.eyebrow}>SAFETY SETUP</Text>
      <Text style={styles.title}>Prepare CoGG Safe</Text>
      <Text style={styles.subtitle}>Allow these device permissions once so emergency assistance can capture the information it needs.</Text>

      <View style={styles.permissionList}>
        {REQUIRED_PERMISSIONS.map(item => {
          const granted = permissionState[item.key] === 'granted';
          const iconName = item.key === 'location' ? 'location' : item.key === 'camera' ? 'camera' : item.key === 'audio' ? 'microphone' : item.key === 'sms' ? 'sms' : item.key === 'call' ? 'phone' : 'notifications';
          return (
            <View key={item.key} style={styles.permissionRow}>
              <View style={styles.iconBox}><Icon name={iconName} size={23} color="#E4002B" /></View>
              <View style={styles.permissionCopy}>
                <View style={styles.permissionHeading}><Text style={styles.permissionTitle}>{item.title}</Text><Text style={[styles.status, granted && styles.statusGranted]}>{statusFor(item.key)}</Text></View>
                <Text style={styles.description}>{item.description}</Text>
              </View>
            </View>
          );
        })}
      </View>

      {blocked ? <Text style={styles.message}>One or more permissions are blocked. Open Android Settings to enable them for CoGG Safe.</Text> : <Text style={styles.message}>You can review these permissions later in Android Settings.</Text>}
      {blocked ? (
        <TouchableOpacity style={styles.primaryButton} onPress={openSosPermissionSettings} accessibilityRole="button"><Icon name="settings" size={19} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Open Android Settings</Text></TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.primaryButton} onPress={requestPermissions} disabled={requesting} accessibilityRole="button">
          {requesting ? <ActivityIndicator color="#FFFFFF" /> : <><Icon name="check" size={19} color="#FFFFFF" /><Text style={styles.primaryButtonText}>Allow required permissions</Text></>}
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.declineButton} onPress={decline} accessibilityRole="button">
        <Text style={styles.declineButtonText}>Don't Allow</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={openSosPermissionSettings}><Text style={styles.secondaryButton}>Review app permissions</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {flexGrow: 1, padding: 24, paddingTop: 56, backgroundColor: '#F7F8FA'},
  brandMark: {width: 58, height: 58, borderRadius: 18, backgroundColor: '#E4002B', alignItems: 'center', justifyContent: 'center', marginBottom: 25},
  eyebrow: {fontSize: 11, fontWeight: '900', letterSpacing: 1.8, color: '#E4002B'},
  title: {fontSize: 30, lineHeight: 36, fontWeight: '900', color: '#111827', marginTop: 9},
  subtitle: {fontSize: 15, lineHeight: 23, color: '#68707D', marginTop: 10, marginBottom: 28},
  permissionList: {backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#E3E6EA', paddingHorizontal: 16},
  permissionRow: {flexDirection: 'row', paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: '#EEF0F2'},
  iconBox: {width: 44, height: 44, borderRadius: 13, backgroundColor: '#FFF0F2', alignItems: 'center', justifyContent: 'center', marginRight: 13},
  permissionCopy: {flex: 1},
  permissionHeading: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  permissionTitle: {fontSize: 16, fontWeight: '900', color: '#111827'},
  status: {fontSize: 11, fontWeight: '900', color: '#B42318'},
  statusGranted: {color: '#168A4B'},
  description: {fontSize: 13, lineHeight: 19, color: '#737B87', marginTop: 5},
  message: {fontSize: 13, lineHeight: 19, color: '#737B87', marginTop: 18},
  primaryButton: {minHeight: 54, borderRadius: 14, backgroundColor: '#E4002B', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22, gap: 9},
  primaryButtonText: {fontSize: 14, fontWeight: '900', color: '#FFFFFF'},
    declineButton: {minHeight: 50, borderRadius: 14, borderWidth: 1, borderColor: '#D8DDE3', alignItems: 'center', justifyContent: 'center', marginTop: 10},
    declineButtonText: {fontSize: 14, fontWeight: '900', color: '#59616D'},
  secondaryButton: {textAlign: 'center', color: '#E4002B', fontSize: 13, fontWeight: '800', marginTop: 18},
});