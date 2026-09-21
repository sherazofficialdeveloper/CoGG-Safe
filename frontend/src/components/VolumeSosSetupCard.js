import React, {useCallback, useEffect, useState} from 'react';
import {AppState, NativeModules, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {colors, radii, spacing, textStyle, typography} from '../theme';

// Phones whose OEM skin adds its own auto-start / background pop-up switches
// on top of stock Android. Without those, Android may still refuse to open
// the app from the background even when everything below is green.
const AGGRESSIVE_OEMS = [
  'xiaomi', 'redmi', 'poco', 'oppo', 'realme', 'oneplus', 'vivo', 'iqoo',
  'tecno', 'infinix', 'itel', 'huawei', 'honor', 'samsung', 'motorola', 'asus',
];

function getOemHint(manufacturer) {
  const name = String(manufacturer || '').toLowerCase();
  if (!AGGRESSIVE_OEMS.some(oem => name.includes(oem))) return null;
  if (/xiaomi|redmi|poco/.test(name)) {
    return 'Xiaomi/Redmi/POCO: App info → Other permissions → turn ON "Display pop-up windows while running in the background" and "Show on Lock screen", and enable Autostart.';
  }
  if (/oppo|realme|oneplus/.test(name)) {
    return 'Oppo/Realme/OnePlus: App info → Battery usage → Allow background activity, and enable Auto-launch / Allow auto start.';
  }
  if (/vivo|iqoo/.test(name)) {
    return 'Vivo/iQOO: App info → Battery → Allow high background power consumption, and allow "Display pop-up while in background".';
  }
  if (/tecno|infinix|itel/.test(name)) {
    return 'Tecno/Infinix/itel: Phone Master or Settings → App info → Autostart ON, Battery → No restrictions, and allow pop-ups while in background.';
  }
  if (/samsung/.test(name)) {
    return 'Samsung: Settings → Battery → Background usage limits → make sure CoGG Safe is NOT in "Sleeping/Deep sleeping apps".';
  }
  return 'On this phone, also allow Autostart / background activity for CoGG Safe in the phone\'s battery or app-launch settings.';
}

/**
 * A single switch that is still OFF. Rows that are already ON are never
 * rendered, so this card behaves like the Location / Camera warnings: it only
 * ever tells the user what still needs attention.
 */
function StatusRow({label, description, required = true, actionLabel, onAction}) {
  const dotColor = required ? colors.danger : colors.warning;
  return (
    <View style={styles.row}>
      <View style={[styles.dot, {backgroundColor: dotColor}]} />
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}{required ? '' : ' (recommended)'}</Text>
        <Text style={styles.rowDescription}>{description}</Text>
      </View>
      {actionLabel ? (
        <TouchableOpacity
          style={styles.rowAction}
          onPress={onAction}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}>
          <Text style={styles.rowActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.pendingBadge}>OFF</Text>
      )}
    </View>
  );
}

/**
 * Shows what still has to be switched on for the Volume-Down x3 SOS to work
 * while the app is closed or the phone is locked. Android does not let an app
 * turn these on silently (Accessibility service, notifications / full-screen
 * alerts, battery), so the user has to be taken to each switch.
 *
 * Like the Location / Camera warnings on the Home screen, this card is a
 * warning only: it renders nothing off Android, nothing when the native module
 * is unavailable, nothing while the first check is still running (so it cannot
 * flash on screen), and nothing once every switch is already on.
 */
export default function VolumeSosSetupCard() {
  const nativeModule = Platform.OS === 'android' ? NativeModules.SosTrigger : null;
  const supported = Boolean(nativeModule && typeof nativeModule.getReadiness === 'function');
  const [readiness, setReadiness] = useState(null);
  const [showRestrictedHelp, setShowRestrictedHelp] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    try {
      setReadiness(await nativeModule.getReadiness());
    } catch (_error) {
      setReadiness(null);
    }
  }, [supported, nativeModule]);

  useEffect(() => {
    if (!supported) return undefined;
    refresh();
    // The user leaves for a Settings page and comes back: re-check.
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') refresh();
    });
    return () => subscription.remove();
  }, [supported, refresh]);

  // Nothing to warn about (yet): stay completely out of the layout.
  if (!supported || !readiness) return null;

  const call = method => () => {
    try {
      nativeModule[method]?.();
    } catch (_error) {
      // Nothing else to do; the Settings page could not be opened.
    }
  };

  // Full-screen alerts are an Android 14+ switch; below that the platform
  // always allows them, so it is never something the user has to fix.
  const fullScreenIntentApplies = readiness.sdkInt >= 34;
  const fullScreenIntentOff = fullScreenIntentApplies && !readiness.fullScreenIntentAllowed;

  const offCount = [
    !readiness.accessibilityEnabled,
    !readiness.notificationsEnabled,
    fullScreenIntentOff,
    !readiness.batteryUnrestricted,
  ].filter(Boolean).length;

  // Everything is already switched on: show no warning at all.
  if (offCount === 0) return null;

  const oemHint = getOemHint(readiness.manufacturer);

  return (
    <View style={styles.card} testID="volume-sos-setup-card">
      <View style={styles.header}>
        <Text style={styles.title}>Volume Button SOS</Text>
        <Text style={styles.actionPill}>SETUP NEEDED</Text>
      </View>
      <Text style={styles.subtitle}>
        Press Volume Down 3 times to send an SOS, even when the app is closed or the screen is locked.
      </Text>

      {!readiness.accessibilityEnabled ? (
        <StatusRow
          label="Volume button detection"
          description="Turn on CoGG Safe under Accessibility → Installed / Downloaded apps."
          actionLabel="Turn on"
          onAction={call('openAccessibilitySettings')}
        />
      ) : null}
      {!readiness.accessibilityEnabled ? (
        <TouchableOpacity onPress={() => setShowRestrictedHelp(value => !value)} accessibilityRole="button">
          <Text style={styles.helpLink}>
            {showRestrictedHelp ? 'Hide help' : 'Switch is greyed out / "Restricted setting"?'}
          </Text>
        </TouchableOpacity>
      ) : null}
      {!readiness.accessibilityEnabled && showRestrictedHelp ? (
        <View style={styles.helpBox}>
          <Text style={styles.helpText}>
            Android blocks accessibility for apps installed from an APK file until you allow it:{'\n'}
            1. Open App info (button below){'\n'}
            2. Tap the ⋮ menu (top right){'\n'}
            3. Tap "Allow restricted settings"{'\n'}
            4. Come back and turn the service on.
          </Text>
          <TouchableOpacity style={styles.helpButton} onPress={call('openAppDetails')} accessibilityRole="button">
            <Text style={styles.helpButtonText}>Open App info</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!readiness.notificationsEnabled ? (
        <StatusRow
          label="Notifications"
          description="Needed to open the SOS screen over the lock screen."
          actionLabel="Allow"
          onAction={call('openNotificationSettings')}
        />
      ) : null}

      {fullScreenIntentOff ? (
        <StatusRow
          label="Full-screen alerts"
          description="Lets the SOS open over the lock screen (Android 14+)."
          actionLabel="Allow"
          onAction={call('openFullScreenIntentSettings')}
        />
      ) : null}

      {!readiness.batteryUnrestricted ? (
        <StatusRow
          label="Battery: unrestricted"
          description="Stops the phone from putting the SOS listener to sleep."
          required={false}
          actionLabel="Allow"
          onAction={call('requestIgnoreBatteryOptimizations')}
        />
      ) : null}

      {oemHint ? (
        <View style={styles.oemBox}>
          <Text style={styles.oemTitle}>Extra step for your phone</Text>
          <Text style={styles.oemText}>{oemHint}</Text>
          <TouchableOpacity style={styles.helpButton} onPress={call('openAppDetails')} accessibilityRole="button">
            <Text style={styles.helpButtonText}>Open App info</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.large,
    padding: spacing.lg,
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs},
  title: textStyle({...typography.h3, color: colors.text}),
  subtitle: textStyle({...typography.bodySmall, color: colors.mutedText, marginBottom: spacing.md}),
  actionPill: textStyle({...typography.label, color: colors.danger}),
  row: {flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm},
  dot: {width: 10, height: 10, borderRadius: 5, marginRight: spacing.md},
  rowBody: {flex: 1, paddingRight: spacing.sm},
  rowLabel: textStyle({...typography.bodySmall, fontWeight: typography.fontWeight.semibold, color: colors.text}),
  rowDescription: textStyle({...typography.caption, color: colors.mutedText, marginTop: 2}),
  rowAction: {
    backgroundColor: colors.primary,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowActionText: textStyle({...typography.buttonSmall, color: '#FFFFFF'}),
  pendingBadge: textStyle({...typography.label, color: colors.warning}),
  helpLink: textStyle({...typography.caption, color: colors.primary, marginLeft: 22, marginBottom: spacing.sm}),
  helpBox: {
    backgroundColor: colors.background,
    borderRadius: radii.medium,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  helpText: textStyle({...typography.caption, color: colors.text, lineHeight: 18}),
  helpButton: {
    alignSelf: 'flex-start',
    borderColor: colors.primary,
    borderWidth: 1,
    borderRadius: radii.medium,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  helpButtonText: textStyle({...typography.buttonSmall, color: colors.primary}),
  oemBox: {
    backgroundColor: '#FFF8E6',
    borderRadius: radii.medium,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  oemTitle: textStyle({...typography.label, color: colors.warning}),
  oemText: textStyle({...typography.caption, color: colors.text, marginTop: 4, lineHeight: 18}),
});
