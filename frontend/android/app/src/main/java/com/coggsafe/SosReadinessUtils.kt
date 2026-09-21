package com.coggsafe

import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat

/**
 * Small, dependency-free checks used by the boot receiver and by the
 * "Volume Button SOS setup" card in the app.
 */
object SosReadinessUtils {

    /**
     * True when the user has switched the volume-key accessibility service on.
     * Entries in ENABLED_ACCESSIBILITY_SERVICES can be stored either as
     * "pkg/pkg.Class" or "pkg/.Class" depending on the OEM, so compare parsed
     * ComponentNames instead of raw strings.
     */
    fun isAccessibilityServiceEnabled(context: Context): Boolean {
        return try {
            val accessibilityOn = Settings.Secure.getInt(
                context.contentResolver,
                Settings.Secure.ACCESSIBILITY_ENABLED,
                0,
            ) == 1
            if (!accessibilityOn) return false

            val enabledServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false

            val target = ComponentName(context, SosVolumeAccessibilityService::class.java)
            enabledServices.split(':').any { entry ->
                val component = ComponentName.unflattenFromString(entry.trim())
                component != null && component == target
            }
        } catch (_: Exception) {
            false
        }
    }

    fun areNotificationsEnabled(context: Context): Boolean {
        return try {
            NotificationManagerCompat.from(context).areNotificationsEnabled()
        } catch (_: Exception) {
            false
        }
    }

    /** Android 14+ can revoke full-screen-intent access; older versions always allow it. */
    fun canUseFullScreenIntent(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 34) return true
        return try {
            val manager = context.getSystemService(NotificationManager::class.java)
            manager?.canUseFullScreenIntent() ?: true
        } catch (_: Exception) {
            true
        }
    }

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        return try {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            powerManager?.isIgnoringBatteryOptimizations(context.packageName) ?: false
        } catch (_: Exception) {
            false
        }
    }
}
