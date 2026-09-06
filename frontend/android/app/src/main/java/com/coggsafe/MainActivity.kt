package com.coggsafe

import android.os.SystemClock
import android.view.KeyEvent
import android.os.Bundle
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

  override fun onResume() {
    super.onResume()
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

  private fun emitPendingPowerButtonTrigger() {
    if (!powerTriggerPrefs.getBoolean("pending", false)) return
    val reactContext = reactInstanceManager.currentReactContext ?: return
    powerTriggerPrefs.edit().putBoolean("pending", false).apply()
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("powerButtonSosTrigger", Arguments.createMap())
  }

  private fun emitPowerButtonTrigger() {
    val reactContext = reactInstanceManager.currentReactContext
    if (reactContext == null) {
      powerTriggerPrefs.edit().putBoolean("pending", true).apply()
      return
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("powerButtonSosTrigger", Arguments.createMap())
  }
}
