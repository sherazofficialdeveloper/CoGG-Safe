package com.coggsafe

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.annotation.SuppressLint
import android.app.ActivityOptions
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.PixelFormat
import android.media.AudioManager
import android.media.VolumeProvider
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.ArrayDeque

/**
 * Global Volume-Down x3 SOS trigger.
 *
 * WHY THE OLD VERSION ONLY FIRED WHEN THE USER OPENED THE APP
 * -----------------------------------------------------------
 * The whole SOS workflow (SMS, call, camera, audio, backend, live location)
 * is JavaScript and needs (a) a running React Native runtime and (b) an
 * Activity in the foreground for camera/mic/location. When the app was closed
 * or the phone locked, this service only wrote `pending=true` and then called
 * startActivity() from the background. Android (and every OEM skin) silently
 * blocks that, the exception was swallowed, and the durable `pending` flag sat
 * there until the user opened the app manually - at which point JS consumed it.
 *
 * WHAT THIS VERSION DOES
 * ----------------------
 *  1. Detects three Volume-Down presses in 5 s
 *       - AccessibilityService key filter   (screen on / unlocked / keyguard)
 *       - MediaSession + VolumeProvider     (screen OFF / keyguard). The old
 *         MediaSession never received keys because Android only routes volume
 *         keys to a session whose PlaybackState is "active"; that state is now
 *         set while the screen is off or the keyguard is showing.
 *  2. If the app is already visible -> emit the JS event immediately.
 *  3. Otherwise launch MainActivity over the lock screen using every route
 *     Android allows, at the same time:
 *       a. full-screen-intent notification (the official route for launching
 *          an activity from the background over the keyguard)
 *       b. direct startActivity, made eligible by a 1x1 accessibility overlay
 *          window (an app with a visible window may start activities)
 *  4. If the Activity still has not come up after FALLBACK_DELAY_MS but the RN
 *     runtime is alive, emit the event anyway so SMS/call still go out.
 *
 * The durable `pending` flag stays the single source of truth and is only
 * cleared by JS (SosTrigger.consumePendingTrigger), so the SOS can never be
 * lost and can never fire twice.
 */
class SosVolumeAccessibilityService : AccessibilityService() {
    private val windowMs = 5000L
    private val requiredPresses = 3

    // Two deliveries of the same physical press (accessibility + media
    // session) or key-repeat while holding the button arrive well inside this
    // gap. A deliberate tap-tap-tap is always slower than this.
    private val rawGapMs = 150L

    // After an SOS fires, ignore further triples for a while so a panicking
    // user hammering the button does not create several SOS events.
    private val retriggerLockoutMs = 10_000L

    private val timestamps = ArrayDeque<Long>()
    private var lastRawSignalMs = NEVER
    private var lastTriggerMs = NEVER
    private val handler = Handler(Looper.getMainLooper())
    private var volumeMediaSession: MediaSession? = null
    private var screenReceiver: BroadcastReceiver? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        isConnected = true

        val info = serviceInfo
        if (info != null) {
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS
            setServiceInfo(info)
        }

        createSosTriggerNotificationChannel()
        createVolumeFallbackSession()
        registerScreenStateReceiver()

        // Keeps the hosting process alive while the app is closed / phone is
        // locked. See SosVolumeKeepAliveService.
        try {
            ContextCompat.startForegroundService(
                this,
                Intent(this, SosVolumeKeepAliveService::class.java),
            )
        } catch (_: Exception) {
            // Best-effort; detection still works while the process lives.
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // No window/content inspection is required for SOS.
    }

    override fun onInterrupt() {
        // Nothing to cancel.
    }

    override fun onUnbind(intent: Intent?): Boolean {
        isConnected = false
        return super.onUnbind(intent)
    }

    // ------------------------------------------------------------------
    // Detection
    // ------------------------------------------------------------------

    override fun onKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_VOLUME_DOWN && event.action == KeyEvent.ACTION_DOWN) {
            onVolumeDownSignal(SystemClock.elapsedRealtime(), event.repeatCount > 0)
        }
        // Never consume the key: normal volume behaviour stays intact.
        return false
    }

    /**
     * Single entry point for BOTH detection paths. Counts distinct physical
     * presses only: key-repeat (button held down) and duplicate delivery of
     * the same press by the two paths are collapsed.
     */
    private fun onVolumeDownSignal(now: Long, isRepeat: Boolean) {
        val gap = now - lastRawSignalMs
        lastRawSignalMs = now
        if (isRepeat || gap < rawGapMs) return

        while (timestamps.isNotEmpty() && now - timestamps.first() > windowMs) {
            timestamps.removeFirst()
        }
        timestamps.addLast(now)
        if (timestamps.size < requiredPresses) return

        timestamps.clear()
        if (now - lastTriggerMs < retriggerLockoutMs) return
        lastTriggerMs = now
        triggerSos()
    }

    /**
     * Second detection path for a dark screen / lock screen.
     *
     * With the screen off Android does not hand volume keys to accessibility
     * services. It routes them to the "default volume session" - the highest
     * priority MediaSession whose playback state is ACTIVE - and calls that
     * session's VolumeProvider. The previous implementation created the
     * session but never gave it a playback state, so Android never chose it
     * and the provider was never called. [updateSessionPlaybackForScreenState]
     * now sets STATE_PLAYING whenever the phone is dark or locked and
     * STATE_STOPPED once the user is actively using an unlocked phone (so we
     * do not interfere with headset/media buttons during normal use).
     */
    private fun createVolumeFallbackSession() {
        if (volumeMediaSession != null) return
        try {
            val session = MediaSession(this, "CoGG Safe SOS Volume Trigger")
            val provider = object : VolumeProvider(
                VolumeProvider.VOLUME_CONTROL_RELATIVE,
                100,
                50,
            ) {
                override fun onAdjustVolume(direction: Int) {
                    if (direction == AudioManager.ADJUST_LOWER) {
                        onVolumeDownSignal(SystemClock.elapsedRealtime(), false)
                    }
                    forwardVolumeAdjustment(direction)
                }
            }
            session.setPlaybackToRemote(provider)
            session.isActive = true
            volumeMediaSession = session
            updateSessionPlaybackForScreenState()
        } catch (_: Exception) {
            volumeMediaSession = null
        }
    }

    private fun updateSessionPlaybackForScreenState() {
        val session = volumeMediaSession ?: return
        try {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            val keyguardManager = getSystemService(KEYGUARD_SERVICE) as KeyguardManager
            val darkOrLocked = !powerManager.isInteractive || keyguardManager.isKeyguardLocked
            val state = if (darkOrLocked) PlaybackState.STATE_PLAYING else PlaybackState.STATE_STOPPED
            session.setPlaybackState(
                PlaybackState.Builder()
                    .setState(state, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 0f)
                    .build(),
            )
        } catch (_: Exception) {
            // Some OEM builds reject playback-state updates; the accessibility
            // path still works while the screen is on.
        }
    }

    private fun registerScreenStateReceiver() {
        if (screenReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                updateSessionPlaybackForScreenState()
            }
        }
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        try {
            ContextCompat.registerReceiver(
                this,
                receiver,
                filter,
                ContextCompat.RECEIVER_NOT_EXPORTED,
            )
            screenReceiver = receiver
        } catch (_: Exception) {
            screenReceiver = null
        }
    }

    /**
     * Because the session owns volume keys while the phone is dark/locked, the
     * adjustment has to be forwarded so the user still gets normal behaviour.
     * With the screen off Android only ever adjusts *active media* (a key
     * press must not silently change the ringer), so mirror that.
     */
    private fun forwardVolumeAdjustment(direction: Int) {
        try {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            val audioManager = getSystemService(AUDIO_SERVICE) as AudioManager
            if (!powerManager.isInteractive && !audioManager.isMusicActive) return
            audioManager.adjustSuggestedStreamVolume(
                direction,
                AudioManager.USE_DEFAULT_STREAM_TYPE,
                AudioManager.FLAG_SHOW_UI,
            )
        } catch (_: Exception) {
            // OEM audio policies can reject programmatic forwarding.
        }
    }

    // ------------------------------------------------------------------
    // Delivery
    // ------------------------------------------------------------------

    private fun triggerSos() {
        // Durable, lossless trigger. Only JS clears it.
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
            .putBoolean("pending", true)
            .putLong("triggered_at", System.currentTimeMillis())
            .putLong("volume_service_suppress_until", SystemClock.elapsedRealtime() + 600L)
            .commit()

        // Already inside the app: run exactly like the on-screen SOS button.
        if (MainActivity.isResumed) {
            val reactContext = currentReactContext()
            if (reactContext != null) {
                emitTriggerToJs(reactContext)
                return
            }
        }

        // App is closed / backgrounded / phone locked. The SOS flow needs a
        // foreground Activity (camera, microphone, location), so bring the
        // real MainActivity up over the lock screen.
        wakeScreen()
        launchSosUi()

        // Safety net: if the Activity could not be launched (OEM blocks it)
        // but the RN runtime is alive, still run the flow so SMS/call go out.
        handler.postDelayed({ headlessFallbackIfStillPending() }, FALLBACK_DELAY_MS)
    }

    private fun headlessFallbackIfStillPending() {
        val pending = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getBoolean("pending", false)
        if (!pending) return // JS already consumed it
        if (MainActivity.isResumed) return // Activity is up; it delivers the event itself
        val reactContext = currentReactContext() ?: return
        emitTriggerToJs(reactContext)
    }

    private fun currentReactContext(): ReactContext? {
        return try {
            (application as? ReactApplication)?.reactHost?.currentReactContext
        } catch (_: Exception) {
            null
        }
    }

    private fun emitTriggerToJs(reactContext: ReactContext) {
        try {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("powerButtonSosTrigger", Arguments.createMap())
        } catch (_: Exception) {
            // The pending flag stays set; JS recovers it on the next mount/resume.
        }
    }

    private fun launchSosUi() {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            action = ACTION_VOLUME_SOS_TRIGGER
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_NO_ANIMATION,
            )
            putExtra("volume_sos_trigger", true)
        }

        // Route A: full-screen-intent notification (works over the keyguard).
        postFullScreenNotification(launchIntent)

        // Route B: direct start, made eligible by a visible overlay window.
        startMainActivityDirect(launchIntent)
    }

    @SuppressLint("MissingPermission")
    private fun postFullScreenNotification(launchIntent: Intent) {
        try {
            if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return

            val pendingIntent = PendingIntent.getActivity(
                this,
                3003,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            val notification = NotificationCompat.Builder(this, SOS_TRIGGER_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_alert)
                .setContentTitle("SOS triggered")
                .setContentText("Opening CoGG Safe to send your emergency alert")
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setFullScreenIntent(pendingIntent, true)
                .setTimeoutAfter(60_000L)
                .build()
            NotificationManagerCompat.from(this).notify(SOS_TRIGGER_NOTIFICATION_ID, notification)
        } catch (_: Exception) {
            // Notification permission / channel blocked; the direct start below
            // and the pending flag are still in place.
        }
    }

    private fun startMainActivityDirect(launchIntent: Intent) {
        val anchor = addVisibleWindowAnchor()
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                val pendingIntent = PendingIntent.getActivity(
                    this,
                    3004,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                val options = ActivityOptions.makeBasic().apply {
                    @Suppress("DEPRECATION")
                    pendingIntentBackgroundActivityStartMode =
                        ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED
                }
                pendingIntent.send(
                    this,
                    0,
                    null,
                    null,
                    null,
                    null,
                    options.toBundle(),
                )
            } else {
                startActivity(launchIntent)
            }
        } catch (_: Exception) {
            // Blocked by Android/OEM background-launch policy. The
            // full-screen notification and the pending flag remain.
        }
        if (anchor != null) {
            handler.postDelayed({ removeVisibleWindowAnchor(anchor) }, ANCHOR_LIFETIME_MS)
        }
    }

    /**
     * Android allows an app that currently owns a visible window to start an
     * Activity from the background. An AccessibilityService may add a
     * TYPE_ACCESSIBILITY_OVERLAY window without any extra permission, so a
     * 1x1 nearly-transparent view is enough to make the launch eligible.
     */
    private fun addVisibleWindowAnchor(): View? {
        return try {
            val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
            val view = View(this).apply { setBackgroundColor(0x01000000) }
            val params = WindowManager.LayoutParams(
                1,
                1,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                PixelFormat.TRANSLUCENT,
            ).apply {
                gravity = Gravity.TOP or Gravity.START
            }
            windowManager.addView(view, params)
            view
        } catch (_: Exception) {
            null
        }
    }

    private fun removeVisibleWindowAnchor(view: View) {
        try {
            val windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
            windowManager.removeView(view)
        } catch (_: Exception) {
            // Already removed (service destroyed) - nothing to do.
        }
    }

    @Suppress("DEPRECATION")
    private fun wakeScreen() {
        try {
            val powerManager = getSystemService(POWER_SERVICE) as PowerManager
            val wakeLock = powerManager.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK or
                    PowerManager.ACQUIRE_CAUSES_WAKEUP or
                    PowerManager.ON_AFTER_RELEASE,
                "CoGGSafe:SosWake",
            )
            wakeLock.acquire(10_000L)
        } catch (_: Exception) {
            // WAKE_LOCK unavailable; MainActivity turnScreenOn still applies.
        }
    }

    private fun createSosTriggerNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(
                    SOS_TRIGGER_CHANNEL_ID,
                    "SOS triggered",
                    NotificationManager.IMPORTANCE_HIGH,
                ).apply {
                    description = "Used to open CoGG Safe over the lock screen when the volume-button SOS is triggered."
                    // Silent on purpose: an SOS must not draw attention to the phone.
                    setSound(null, null)
                    enableVibration(false)
                    lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
                    setBypassDnd(true)
                },
            )
        } catch (_: Exception) {
        }
    }

    override fun onDestroy() {
        isConnected = false
        handler.removeCallbacksAndMessages(null)
        try {
            screenReceiver?.let { unregisterReceiver(it) }
        } catch (_: Exception) {
        }
        screenReceiver = null
        try {
            volumeMediaSession?.isActive = false
            volumeMediaSession?.release()
        } catch (_: Exception) {
        }
        volumeMediaSession = null
        // Do not stop SosVolumeKeepAliveService here: Android/OEMs can briefly
        // destroy and rebind an AccessibilityService.
        super.onDestroy()
    }

    companion object {
        const val ACTION_VOLUME_SOS_TRIGGER = "com.coggsafe.action.VOLUME_SOS_TRIGGER"
        const val ACTION_VOLUME_SOS_BRIDGE = "com.coggsafe.action.VOLUME_SOS_BRIDGE"
        const val SOS_TRIGGER_NOTIFICATION_ID = 4109
        private const val SOS_TRIGGER_CHANNEL_ID = "coggsafe_sos_trigger_v2"
        private const val PREFS_NAME = "cogg_power_trigger"
        private const val FALLBACK_DELAY_MS = 2000L
        private const val ANCHOR_LIFETIME_MS = 2500L
        private const val NEVER = -1_000_000L

        /** True while Android has this service bound (i.e. the user enabled it). */
        @Volatile
        var isConnected = false
    }
}
