import {AppState, Linking, PermissionsAndroid, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Required Android permissions for SOS emergency functionality.
 * 
 * Phase 4 Requirements:
 * - ACCESS_FINE_LOCATION: Required for GPS coordinates
 * - CAMERA: Required for front/back emergency photos
 * - RECORD_AUDIO: Required for 5-second emergency audio
 * - POST_NOTIFICATIONS: Required for in-app notification badge updates
 * - SMS: Direct SMS is intentionally not requested; Android opens the system composer instead.
 * 
 * SERVICE INTERACTION:
 * - All required permissions must be granted before SOS activation
 * - SOS remains disabled if ANY required permission is denied
 * - User can request all permissions at once or individually
 * - If user denies "don't ask again", user must go to Settings
 */
export const PERMISSION_ONBOARDING_KEY = '@coggsafe/permission-onboarding-complete';
export const PERMISSION_ONBOARDING_SKIPPED_KEY = '@coggsafe/permission-onboarding-skipped';

export const REQUIRED_PERMISSIONS = Object.freeze([
  {key: 'location', permission: PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, title: 'Location', description: 'Location access is required to share your current location during an emergency.'},
  {key: 'camera', permission: PermissionsAndroid.PERMISSIONS.CAMERA, title: 'Camera', description: 'Camera access is required to capture emergency evidence when SOS is activated.'},
  {key: 'audio', permission: PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, title: 'Microphone', description: 'Microphone access is required to record emergency audio during SOS.'},
  {key: 'call', permission: PermissionsAndroid.PERMISSIONS.CALL_PHONE, title: 'Phone', description: 'Phone access is required to place the emergency call from the user device.'},
  ...(Platform.Version >= 33 && PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS ? [{key: 'notifications', permission: PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, title: 'Notifications', description: 'Notifications are required to keep you informed about emergency activity.'}] : []),
]);

export const SOS_TRIGGER_PERMISSIONS = REQUIRED_PERMISSIONS.filter(item => ['location', 'camera', 'audio', 'notifications'].includes(item.key));
export const COMMUNICATION_PERMISSIONS = REQUIRED_PERMISSIONS.filter(item => item.key === 'call');

const REQUIRED_ANDROID_PERMISSIONS = REQUIRED_PERMISSIONS
  .map(item => item.permission)
  .filter(Boolean);

const EMPTY_PERMISSION_STATE = Object.freeze({
  location: PermissionsAndroid.RESULTS.DENIED,
  camera: PermissionsAndroid.RESULTS.DENIED,
  audio: PermissionsAndroid.RESULTS.DENIED,
  sms: 'composer_required',
  smsDeliveryMode: 'composer',
  smsAutomaticSendAvailable: false,
  call: PermissionsAndroid.RESULTS.DENIED,
  notifications: PermissionsAndroid.RESULTS.DENIED,
  allRequiredGranted: false,
  communicationPermissionsGranted: false,
  triggerPermissionsGranted: false,
  isChecking: true,
  canRequest: true,
});

/**
 * Build permission state object from individual permission results
 */
function buildPermissionState(permissions) {
  const location = permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] || PermissionsAndroid.RESULTS.DENIED;
  const camera = permissions[PermissionsAndroid.PERMISSIONS.CAMERA] || PermissionsAndroid.RESULTS.DENIED;
  const audio = permissions[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] || PermissionsAndroid.RESULTS.DENIED;
  const sms = 'composer_required';
  const call = permissions[PermissionsAndroid.PERMISSIONS.CALL_PHONE] || PermissionsAndroid.RESULTS.DENIED;
  const notifPerm = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  const notifications = Platform.Version >= 33 && notifPerm
    ? permissions[notifPerm] || PermissionsAndroid.RESULTS.DENIED
    : PermissionsAndroid.RESULTS.GRANTED;

  const triggerPermissionsGranted =
    location === PermissionsAndroid.RESULTS.GRANTED &&
    camera === PermissionsAndroid.RESULTS.GRANTED &&
    audio === PermissionsAndroid.RESULTS.GRANTED &&
    notifications === PermissionsAndroid.RESULTS.GRANTED;

  const communicationPermissionsGranted =
    call === PermissionsAndroid.RESULTS.GRANTED;

  // Manual SOS remains available when the trigger protections are granted even if
  // communications permissions are still pending or denied. Communication failures
  // are surfaced separately as real SMS/call results instead of blocking the SOS.
  const allRequiredGranted = triggerPermissionsGranted;

  // Can request = none of them are "NEVER_ASK_AGAIN"
  const canRequest =
    location !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
    camera !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
    audio !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
    call !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN &&
    notifications !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;

  return {
    location,
    camera,
    audio,
    sms,
    smsDeliveryMode: 'composer',
    smsAutomaticSendAvailable: false,
    call,
    notifications,
    allRequiredGranted,
    communicationPermissionsGranted,
    triggerPermissionsGranted,
    isChecking: false,
    canRequest,
  };
}

function buildPermissionStateFromCheckedResults(checkedResults, requestResults = {}) {
  const mergedResults = {...checkedResults};

  REQUIRED_PERMISSIONS.forEach(item => {
    if (requestResults[item.permission] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
      mergedResults[item.permission] = PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN;
    }
  });

  return buildPermissionState(mergedResults);
}

async function checkRequiredAndroidPermissions() {
  const entries = await Promise.all(REQUIRED_ANDROID_PERMISSIONS.map(async permission => [
    permission,
    (await PermissionsAndroid.check(permission))
      ? PermissionsAndroid.RESULTS.GRANTED
      : PermissionsAndroid.RESULTS.DENIED,
  ]));
  return Object.fromEntries(entries);
}

export function createInitialSosPermissionState() {
  if (Platform.OS !== 'android') {
    // No iOS permission adapter exists yet. Fail closed rather than
    // declaring SOS ready without checking the actual device state.
    return {
      location: PermissionsAndroid.RESULTS.DENIED,
      camera: PermissionsAndroid.RESULTS.DENIED,
      audio: PermissionsAndroid.RESULTS.DENIED,
      sms: 'composer_required',
      smsDeliveryMode: 'composer',
      smsAutomaticSendAvailable: false,
      call: PermissionsAndroid.RESULTS.DENIED,
      notifications: PermissionsAndroid.RESULTS.DENIED,
      allRequiredGranted: false,
      communicationPermissionsGranted: false,
      triggerPermissionsGranted: false,
      isChecking: false,
      canRequest: false,
    };
  }

  return {...EMPTY_PERMISSION_STATE};
}

/**
 * Check all required SOS permissions
 */
export async function checkSosPermissions() {
  if (Platform.OS !== 'android') {
    return createInitialSosPermissionState();
  }

  try {
    const results = await checkRequiredAndroidPermissions();
    return buildPermissionState(results);
  } catch (error) {
    return buildPermissionState({});
  }
}

export function getPermissionStatus(permissionState, key) {
  return permissionState?.[key] || PermissionsAndroid.RESULTS.DENIED;
}

/**
 * Request all required SOS permissions at once
 */
export async function requestRequiredPermissions() {
  if (Platform.OS !== 'android') {
    return createInitialSosPermissionState();
  }

  try {
    if (__DEV__) console.log('PERMISSION_CHECK_STARTED');
    const current = await checkRequiredAndroidPermissions();
    const results = {};

    // Android displays runtime prompts one at a time. Await every response before
    // moving on so a denial never masks the next permission's real result.
    for (const item of REQUIRED_PERMISSIONS) {
      if (current[item.permission] === PermissionsAndroid.RESULTS.GRANTED) continue;
      const result = await PermissionsAndroid.request(item.permission);
      results[item.permission] = result;
      if (__DEV__) console.log(`PERMISSION_RESULT_${item.key.toUpperCase()}`, {result});
    }

    const verifiedState = await checkSosPermissions();
    const nextState = buildPermissionStateFromCheckedResults(
      Object.fromEntries(REQUIRED_PERMISSIONS.map(item => [item.permission, verifiedState[item.key]])),
      results,
    );
    if (__DEV__ && nextState.allRequiredGranted) console.log('ALL_REQUIRED_PERMISSIONS_GRANTED');
    return nextState;
  } catch (error) {
    return {...buildPermissionState({}), error: error?.message || 'Unable to request SOS permissions.'};
  }
}

export async function requestSosPermission(key) {
  const item = REQUIRED_PERMISSIONS.find(candidate => candidate.key === key);
  if (!item || Platform.OS !== 'android') return createInitialSosPermissionState();

  try {
    const alreadyGranted = await PermissionsAndroid.check(item.permission);
    if (alreadyGranted) return checkSosPermissions();
    const result = await PermissionsAndroid.request(item.permission);
    if (__DEV__) console.log(`PERMISSION_RESULT_${item.key.toUpperCase()}`, {result});
    const verifiedState = await checkSosPermissions();
    return buildPermissionStateFromCheckedResults(
      Object.fromEntries(REQUIRED_PERMISSIONS.map(candidate => [candidate.permission, verifiedState[candidate.key]])),
      {[item.permission]: result},
    );
  } catch (error) {
    return {...buildPermissionState({}), error: error?.message || `Unable to request ${item.title} permission.`};
  }
}
export async function openSosPermissionSettings() {
  try {
    await Linking.openSettings();
  } catch (error) {
    return false;
  }
  return true;
}

export function subscribeToPermissionChanges(onChange) {
  const subscription = AppState.addEventListener('change', nextState => {
    if (nextState === 'active') onChange();
  });

  return () => subscription.remove();
}

export async function isPermissionOnboardingComplete() {
  try {
    return (await AsyncStorage.getItem(PERMISSION_ONBOARDING_KEY)) === 'true';
  } catch (error) {
    return false;
  }
}

export async function markPermissionOnboardingComplete() {
  try {
    await AsyncStorage.setItem(PERMISSION_ONBOARDING_KEY, 'true');
    await AsyncStorage.removeItem(PERMISSION_ONBOARDING_SKIPPED_KEY);
    return true;
  } catch (error) {
    return false;
  }
}

export async function shouldShowPermissionOnboarding() {
  const permissionState = await checkSosPermissions();
  if (permissionState.triggerPermissionsGranted) return false;
  if (await isPermissionOnboardingComplete()) return true;
  try {
    return (await AsyncStorage.getItem(PERMISSION_ONBOARDING_SKIPPED_KEY)) !== 'true';
  } catch (error) {
    return true;
  }
}

export async function markPermissionOnboardingSkipped() {
  try {
    await AsyncStorage.setItem(PERMISSION_ONBOARDING_SKIPPED_KEY, 'true');
    return true;
  } catch (error) {
    return false;
  }
}

export const requestSosPermissions = requestRequiredPermissions;

export function getMissingPermissions(permissionState) {
  return REQUIRED_PERMISSIONS.filter(item => permissionState[item.key] !== PermissionsAndroid.RESULTS.GRANTED);
}

export function areRequiredPermissionsGranted(permissionState) {
  return Boolean(permissionState?.allRequiredGranted);
}