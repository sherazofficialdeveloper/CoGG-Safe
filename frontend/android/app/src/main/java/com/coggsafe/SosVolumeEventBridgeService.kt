package com.coggsafe

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Delivers the volume-key SOS trigger into an already-running React Native
 * context without ever showing an Activity, turning on the screen, or
 * bringing the app to the foreground.
 *
 * Unlike [SosVolumeAccessibilityService] and [SosVolumeKeepAliveService],
 * this service is declared with no `android:process` override, so it always
 * runs in the normal main app process — the same process that hosts
 * MainActivity and the React Native runtime. That is what makes
 * `reactHost.currentReactContext` meaningful here.
 *
 * It is started (cross-process) by SosVolumeAccessibilityService only after
 * confirming the main app process is already alive. Two outcomes:
 *
 *  - React Native has already finished loading in this process (the normal
 *    case whenever the app was merely backgrounded/locked, not
 *    force-stopped): the "powerButtonSosTrigger" event is emitted directly
 *    into the live JS context, exactly as if the on-screen SOS button had
 *    been pressed, and this service stops itself immediately. No UI is ever
 *    shown.
 *  - React Native is still finishing its own startup in this process (rare,
 *    e.g. the app process was only just created moments earlier for some
 *    other reason): nothing more is done here. The durable "pending"
 *    SharedPreferences flag was already set by the accessibility service
 *    before this service was started, so App.js's existing
 *    consumePendingTrigger() call on mount recovers the trigger a moment
 *    later with no further native action needed.
 *
 * The brief MIN-importance foreground notification exists only to satisfy
 * Android's foreground-service requirements for starting a service from the
 * background; it carries no sound/vibration and disappears the instant this
 * service stops (typically within a few milliseconds).
 */
class SosVolumeEventBridgeService : Service() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startAsForeground()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val reactContext = (application as? ReactApplication)
                ?.reactHost
                ?.currentReactContext
            reactContext
                ?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                ?.emit("powerButtonSosTrigger", Arguments.createMap())
        } catch (_: Exception) {
            // The durable "pending" SharedPreferences flag remains the
            // source of truth; App.js recovers it on next mount/resume.
        } finally {
            stopSelf(startId)
        }
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CoGG Safe")
            .setContentText("Delivering emergency SOS trigger")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
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
                "SOS trigger delivery",
                NotificationManager.IMPORTANCE_MIN,
            ).apply {
                description = "Very brief, silent background step used to deliver a volume-key SOS trigger."
                setShowBadge(false)
            }
        )
    }

    companion object {
        private const val CHANNEL_ID = "coggsafe_sos_bridge"
        private const val NOTIFICATION_ID = 4110
    }
}
