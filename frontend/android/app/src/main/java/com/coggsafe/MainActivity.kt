package com.coggsafe

import android.os.SystemClock
import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.bridge.Arguments
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.modules.core.DeviceEventManagerModule

class MainActivity : ReactActivity() {
  private val powerPressWindowMs = 5000L
  private val requiredPowerPresses = 3
  private val powerPressTimestamps = ArrayDeque<Long>()

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

  override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
    if (keyCode == KeyEvent.KEYCODE_POWER) {
      val now = SystemClock.elapsedRealtime()

      while (powerPressTimestamps.isNotEmpty() && now - powerPressTimestamps.first() > powerPressWindowMs) {
        powerPressTimestamps.removeFirst()
      }

      powerPressTimestamps.addLast(now)

      if (powerPressTimestamps.size >= requiredPowerPresses) {
        powerPressTimestamps.clear()
        emitPowerButtonTrigger()
      }
    }

    return super.onKeyDown(keyCode, event)
  }

  private fun emitPowerButtonTrigger() {
    val reactContext = reactInstanceManager.currentReactContext ?: return
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit("powerButtonSosTrigger", Arguments.createMap())
  }
}
