package com.coggsafe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

/**
 * Some OEM Android builds do not automatically re-bind an enabled
 * AccessibilityService immediately after boot until the app has been opened
 * once. Restarting the keep-alive foreground service on BOOT_COMPLETED (when
 * the user has already turned the accessibility service on) closes that gap
 * so the volume-key SOS trigger is live again as soon as possible after a
 * restart, without requiring the user to remember to open the app.
 */
class SosBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!isAccessibilityServiceEnabled(context)) return

        val serviceIntent = Intent(context, SosVolumeKeepAliveService::class.java)
        try {
            ContextCompat.startForegroundService(context, serviceIntent)
        } catch (_: Exception) {
            // If Android still restricts this at boot on a given OEM build,
            // the service starts anyway as soon as the accessibility
            // framework rebinds SosVolumeAccessibilityService.
        }
    }

    private fun isAccessibilityServiceEnabled(context: Context): Boolean =
        SosReadinessUtils.isAccessibilityServiceEnabled(context)
}
