package com.coggsafe

import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Hardware-button SOS trigger.
 *
 * IMPORTANT PLATFORM LIMITATION (see /POWER_BUTTON_SOS_AUDIT.md at the repo
 * root for the full writeup): on stock, non-rooted Android, KEYCODE_POWER
 * is intercepted by the system (PhoneWindowManager) before it is ever
 * dispatched to an Activity's onKeyDown. This is documented Android
 * platform behavior, not a bug in this file — there is no public API that
 * lets a normal third-party app reliably observe physical power-button
 * presses. The onKeyDown branch below is therefore kept as a best-effort
 * path only: it will do nothing on the vast majority of real devices, and
 * that is expected, not a regression.
 *
 * The RELIABLE hardware trigger is the volume-key branch further down.
 * Unlike the power key, volume key events ARE delivered to a focused
 * Activity's onKeyDown on stock Android, so 3x Volume-Down works as an
 * actual, testable physical panic-button trigger while the app is in the
 * foreground. Both branches emit the exact same "powerButtonSosTrigger"
 * event into the same existing SOS orchestrator — there is no separate
 * SOS workflow, and the manual on-screen SOS button keeps working
 * regardless of whether either hardware path fires on a given device.
 */
class MainActivity : ReactActivity() {
  private val powerTriggerPrefs by lazy { getSharedPreferences("cogg_power_trigger", MODE_PRIVATE) }
  private val powerPressWindowMs = 5000L
  private val requiredPowerPresses = 3
  private val powerPressTimestamps = ArrayDeque<Long>()
  private var lastPowerKeyEventTimeMs = 0L
  private val powerKeyDebounceMs = 200L

  // Independent counter for the volume-key path so normal volume usage
  // (e.g. adjusting media volume) and the power-key best-effort path never
  // interfere with each other's counts.
  private val volumePressWindowMs = 5000L
  private val requiredVolumePresses = 3
  private val volumePressTimestamps = ArrayDeque<Long>()
  private var lastVolumeKeyEventTimeMs = 0L
  private val volumeKeyDebounceMs = 200L

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "CoGGSafe"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    val volumeTrigger = intent?.action == SosVolumeAccessibilityService.ACTION_VOLUME_SOS_TRIGGER
    if (volumeTrigger) {
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
        setShowWhenLocked(true)
        setTurnScreenOn(true)
      } else {
        @Suppress("DEPRECATION")
        window.addFlags(
          android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )
      }
    }
    super.onCreate(savedInstanceState)
    // Never put a system dialog on top of an emergency launch. The app
    // asks for the exemption on a normal (user-initiated) start instead.
    if (!volumeTrigger) maybeRequestBatteryOptimizationExemption()
  }

  /**
   * Asks the user, once, to exempt CoGG Safe from battery optimization.
   * This is the single biggest lever an app can pull to stop the OS (and
   * most OEM battery managers) from killing the process that hosts the
   * volume-key SOS accessibility service while the app is closed or the
   * phone is locked. It does not require a dangerous runtime permission —
   * it opens a system dialog the user must accept.
   */
  private fun maybeRequestBatteryOptimizationExemption() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val alreadyAsked = powerTriggerPrefs.getBoolean("battery_exemption_asked", false)
    if (alreadyAsked) return

    val powerManager = getSystemService(POWER_SERVICE) as? PowerManager ?: return
    if (powerManager.isIgnoringBatteryOptimizations(packageName)) return

    powerTriggerPrefs.edit().putBoolean("battery_exemption_asked", true).apply()
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:$packageName")
      }
      startActivity(intent)
    } catch (_: Exception) {
      // Some OEM builds block this intent; the volume-key trigger still
      // works, just less reliably in the background on that device.
    }
  }

  override fun onResume() {
    super.onResume()
    isResumed = true
    // The SOS launch notification (full-screen intent fallback) has done
    // its job once the Activity is on screen.
    try {
      NotificationManagerCompat.from(this)
        .cancel(SosVolumeAccessibilityService.SOS_TRIGGER_NOTIFICATION_ID)
    } catch (_: Exception) {
    }
    emitPendingPowerButtonTrigger()
    handleWidgetIntent(intent)
    handleVolumeSosIntent(intent)
  }

  override fun onPause() {
    isResumed = false
    super.onPause()
  }

  override fun onNewIntent(intent: Intent?) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleWidgetIntent(intent)
    handleVolumeSosIntent(intent)
  }

  private fun handleVolumeSosIntent(intent: Intent?) {
    if (intent?.action != SosVolumeAccessibilityService.ACTION_VOLUME_SOS_TRIGGER) return
    intent.action = null
    // The accessibility service already set the pending flag. If React is
    // ready, emitPendingPowerButtonTrigger() above will dispatch it; if not,
    // the pending flag survives until the RN context is available.
  }

  private fun handleWidgetIntent(intent: Intent?) {
    if (intent?.action != SosWidgetProvider.ACTION_WIDGET_SOS) return
    intent.action = null

    // SosWidgetHoldActivity has already completed the real 3-second hold.
    // Do NOT start another 3-second timer here; doing so would double-trigger
    // the SOS after the hold surface has already fired the durable pending flag.
    emitPendingPowerButtonTrigger()
  }

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    // Best-effort path. On most stock devices the system consumes
    // KEYCODE_POWER before the app ever sees it — see class doc above.
    if (keyCode == KeyEvent.KEYCODE_POWER) {
      val now = SystemClock.elapsedRealtime()

      // Debounce: ignore key events that come too quickly after the last one
      // to avoid counting repeated key events from a single physical press
      if (now - lastPowerKeyEventTimeMs < powerKeyDebounceMs) {
        return super.onKeyDown(keyCode, event)
      }
      lastPowerKeyEventTimeMs = now

      // Remove stale timestamps outside the window
      while (powerPressTimestamps.isNotEmpty() && now - powerPressTimestamps.first() > powerPressWindowMs) {
        powerPressTimestamps.removeFirst()
      }

      // Add current press
      powerPressTimestamps.addLast(now)

      // Check if we've reached the threshold
      if (powerPressTimestamps.size == requiredPowerPresses) {
        powerPressTimestamps.clear()
        lastPowerKeyEventTimeMs = 0L
        emitPowerButtonTrigger()
        return true
      }
      return super.onKeyDown(keyCode, event)
    }

    // Reliable path. Volume keys ARE delivered to a focused Activity on
    // stock Android, so this actually fires on a real device. Triggers on
    // Volume-Down only (not Up) to avoid double-counting a single
    // "adjust volume" gesture that can generate both.
    if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
      val now = SystemClock.elapsedRealtime()
      val volumeServiceSuppressUntil = powerTriggerPrefs.getLong("volume_service_suppress_until", 0L)
      if (volumeServiceSuppressUntil > now) {
        // The accessibility service already fired the SOS for this triple.
        // Drop the presses this Activity counted for it too, otherwise the
        // very next press (#4) would look like a fresh triple and fire again.
        volumePressTimestamps.clear()
        powerTriggerPrefs.edit().remove("volume_service_suppress_until").apply()
        return super.onKeyDown(keyCode, event)
      }

      if (now - lastVolumeKeyEventTimeMs < volumeKeyDebounceMs) {
        return super.onKeyDown(keyCode, event)
      }
      lastVolumeKeyEventTimeMs = now

      while (volumePressTimestamps.isNotEmpty() && now - volumePressTimestamps.first() > volumePressWindowMs) {
        volumePressTimestamps.removeFirst()
      }

      volumePressTimestamps.addLast(now)

      if (volumePressTimestamps.size == requiredVolumePresses) {
        volumePressTimestamps.clear()
        lastVolumeKeyEventTimeMs = 0L
        emitPowerButtonTrigger()
        // Deliberately NOT consuming the event (falls through to
        // super.onKeyDown) so the 3rd press still adjusts system volume
        // as the user expects — the SOS trigger is a side effect, not a
        // replacement for normal volume-button behavior.
      }
    }

    return super.onKeyDown(keyCode, event)
  }

  companion object {
    /**
     * True only while MainActivity is in the foreground. Read by
     * SosVolumeAccessibilityService (same process) to decide between
     * "emit straight into JS" and "launch the Activity first".
     */
    @Volatile
    var isResumed = false
  }

  private fun emitPendingPowerButtonTrigger() {
    if (!powerTriggerPrefs.getBoolean("pending", false)) return
    val reactContext = (application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext
    if (reactContext == null) {
      // React Native can still be booting when Android resumes the Activity
      // after a hardware-triggered cold start. Keep the durable pending flag
      // and retry briefly instead of losing the SOS event.
      Handler(Looper.getMainLooper()).postDelayed({ emitPendingPowerButtonTrigger() }, 150L)
      return
    }
    // Do NOT clear the durable pending flag here. The JS listener consumes
    // the flag after it has mounted. Clearing it at this point creates a
    // cold-start race: Android may create/resume MainActivity before the
    // React Native JS listener is mounted, so the native event is emitted
    // into an empty bridge and the SOS is lost. Keeping the flag until JS
    // calls consumePendingTrigger() makes the trigger lossless.
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("powerButtonSosTrigger", Arguments.createMap())
  }

  private fun emitPowerButtonTrigger() {
    val reactContext = (application as? com.facebook.react.ReactApplication)?.reactHost?.currentReactContext
    if (reactContext == null) {
      powerTriggerPrefs.edit().putBoolean("pending", true).apply()
      return
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("powerButtonSosTrigger", Arguments.createMap())
  }
}
