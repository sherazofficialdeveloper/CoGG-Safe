package com.coggsafe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps the app process that hosts [SosVolumeAccessibilityService] alive.
 *
 * A plain AccessibilityService running with no foreground service attached
 * is still just a background process to most Android OEM RAM/battery
 * managers (MIUI, ColorOS, FuntouchOS/OriginOS, EMUI/HarmonyOS, some Samsung
 * device-care modes). Those OEM layers routinely freeze or kill background
 * processes once the app is swiped from Recents or the screen has been
 * locked for a while, which silently stops volume-key detection even though
 * the code itself is correct on stock/AOSP Android.
 *
 * Attaching a low-priority ongoing foreground notification is the standard,
 * documented way to tell Android (and most OEM managers) "this process is
 * doing an active job, do not kill it" and to be eligible for showing a
 * full-screen alert over the lock screen later. This alone cannot override
 * every OEM's aggressive battery policy — the user may still need to
 * whitelist the app in the OEM's own battery/auto-start settings — but it
 * is the biggest lever the app itself can pull.
 */
class SosVolumeKeepAliveService : Service() {
    companion object {
        private const val CHANNEL_ID = "coggsafe_sos_keepalive"
        private const val NOTIFICATION_ID = 4108
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startAsForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY: if the OS still kills this process under memory
        // pressure, ask it to recreate the service (and therefore restart
        // the accessibility service binding) as soon as resources allow.
        return START_STICKY
    }

    private fun startAsForeground() {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CoGG Safe SOS is active")
            .setContentText("Volume-key emergency trigger is running in the background")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "SOS background trigger",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Keeps the emergency volume-key trigger running while the app is closed."
                setShowBadge(false)
            }
        )
    }
}
