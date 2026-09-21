package com.coggsafe

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Native bridge for the hardware/widget SOS trigger.
 *
 * - The trigger itself is stored durably in SharedPreferences so a cold React
 *   Native runtime cannot lose the event between Android detecting it and JS
 *   mounting ([consumePendingTrigger]).
 * - The readiness/settings methods let the app show the user exactly what is
 *   still missing for the volume-button SOS to work with the app closed or the
 *   phone locked (accessibility service, notifications, full-screen alerts,
 *   battery). None of these can be granted silently by an app - Android
 *   requires the user to flip each switch - so the app must guide them there.
 */
class SosTriggerModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SosTrigger"

    @ReactMethod
    fun consumePendingTrigger(promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(
                "cogg_power_trigger",
                android.content.Context.MODE_PRIVATE,
            )
            val pending = prefs.getBoolean("pending", false)
            if (pending) {
                prefs.edit().putBoolean("pending", false).apply()
            }
            promise.resolve(pending)
        } catch (e: Exception) {
            promise.reject("SOS_TRIGGER_READ_FAILED", e)
        }
    }

    @ReactMethod
    fun getReadiness(promise: Promise) {
        try {
            val map = Arguments.createMap()
            map.putBoolean("accessibilityEnabled", SosReadinessUtils.isAccessibilityServiceEnabled(reactContext))
            map.putBoolean("accessibilityConnected", SosVolumeAccessibilityService.isConnected)
            map.putBoolean("notificationsEnabled", SosReadinessUtils.areNotificationsEnabled(reactContext))
            map.putBoolean("fullScreenIntentAllowed", SosReadinessUtils.canUseFullScreenIntent(reactContext))
            map.putBoolean("batteryUnrestricted", SosReadinessUtils.isIgnoringBatteryOptimizations(reactContext))
            map.putInt("sdkInt", Build.VERSION.SDK_INT)
            map.putString("manufacturer", (Build.MANUFACTURER ?: "").lowercase())
            promise.resolve(map)
        } catch (e: Exception) {
            promise.reject("SOS_READINESS_FAILED", e)
        }
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) {
        launchSettings(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), promise)
    }

    /** App info page - also where "Allow restricted settings" lives on Android 13+. */
    @ReactMethod
    fun openAppDetails(promise: Promise) {
        launchSettings(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            },
            promise,
        )
    }

    @ReactMethod
    fun openNotificationSettings(promise: Promise) {
        launchSettings(
            Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                putExtra(Settings.EXTRA_APP_PACKAGE, reactContext.packageName)
            },
            promise,
        )
    }

    @ReactMethod
    fun openFullScreenIntentSettings(promise: Promise) {
        if (Build.VERSION.SDK_INT >= 34) {
            val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
                data = Uri.parse("package:${reactContext.packageName}")
            }
            if (tryLaunch(intent)) {
                promise.resolve(true)
                return
            }
        }
        openNotificationSettings(promise)
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
            data = Uri.parse("package:${reactContext.packageName}")
        }
        if (tryLaunch(direct)) {
            promise.resolve(true)
            return
        }
        launchSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), promise)
    }

    private fun tryLaunch(intent: Intent): Boolean {
        return try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun launchSettings(intent: Intent, promise: Promise) {
        promise.resolve(tryLaunch(intent))
    }
}
