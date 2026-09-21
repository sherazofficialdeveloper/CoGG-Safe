package com.coggsafe

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Full-screen SOS confirmation screen launched by a single tap on the
 * home-screen widget.
 *
 * A home-screen AppWidget can only ever report a plain tap through a
 * PendingIntent — it can never receive a raw "press and hold" gesture,
 * because holding a finger down directly on a home-screen widget is
 * intercepted by the launcher itself (to enter widget move/resize/remove
 * mode) before the press ever reaches the app. So the widget itself only
 * does a single quick tap; that tap opens THIS activity, and the real
 * 3-second hold-to-confirm is measured here with ACTION_DOWN/ACTION_UP,
 * where the launcher can no longer intercept it.
 */
class SosWidgetHoldActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private val holdDurationMs = 3000L
    private var holdStartedAt = 0L
    private var completed = false
    private lateinit var status: TextView
    private lateinit var subtitle: TextView

    private val progressRunnable = object : Runnable {
        override fun run() {
            if (completed || holdStartedAt == 0L) return
            val elapsed = SystemClockCompat.elapsedRealtime() - holdStartedAt
            val remaining = (holdDurationMs - elapsed).coerceAtLeast(0L)
            val seconds = ((remaining + 999L) / 1000L).coerceAtLeast(0L)

            status.text = if (remaining <= 0L) {
                "SOS\nACTIVATING"
            } else {
                "SOS\n${seconds}s"
            }

            if (remaining <= 0L) {
                completeSos()
            } else {
                handler.postDelayed(this, 50L)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        super.onCreate(savedInstanceState)

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }

        // Full screen: this activity uses a non-floating theme
        // (SosWidgetHoldTheme), so it fills the whole display like any
        // normal activity instead of a widget-sized floating card.
        window.setBackgroundDrawableResource(android.R.color.white)

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.WHITE)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
        }

        val title = TextView(this).apply {
            text = "Emergency SOS"
            textSize = 22f
            setTextColor(Color.BLACK)
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(8))
        }

        subtitle = TextView(this).apply {
            text = "Press and hold the button for 3 seconds to send an SOS alert"
            textSize = 15f
            setTextColor(Color.DKGRAY)
            gravity = Gravity.CENTER
            setPadding(dp(32), 0, dp(32), dp(32))
        }

        val circleSizeDp = 220

        status = TextView(this).apply {
            text = "SOS\nPRESS & HOLD"
            textSize = 22f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(10), dp(8), dp(10), dp(8))
            isClickable = true
            isFocusable = true
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.rgb(228, 0, 43))
            }
        }

        content.addView(
            title,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        )
        content.addView(
            subtitle,
            LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        )
        content.addView(
            status,
            LinearLayout.LayoutParams(dp(circleSizeDp), dp(circleSizeDp))
        )

        root.addView(
            content,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.CENTER }
        )

        val cancelText = TextView(this).apply {
            text = "Cancel"
            textSize = 15f
            setTextColor(Color.GRAY)
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(16), dp(24), dp(24))
            isClickable = true
            setOnClickListener { if (!completed) { cancelHold(); } }
        }
        root.addView(
            cancelText,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL }
        )

        setContentView(root)

        status.setOnTouchListener { _, event ->
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    beginHold()
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!completed) cancelHold()
                    true
                }
                else -> true
            }
        }
    }

    override fun onBackPressed() {
        if (!completed) {
            cancelHold()
        } else {
            super.onBackPressed()
        }
    }

    private fun beginHold() {
        if (completed) return
        handler.removeCallbacks(progressRunnable)
        holdStartedAt = SystemClockCompat.elapsedRealtime()
        status.text = "SOS\n3s"
        handler.post(progressRunnable)
    }

    private fun cancelHold() {
        holdStartedAt = 0L
        handler.removeCallbacks(progressRunnable)
        status.text = "SOS\nCANCELLED"
        SosWidgetProvider.updateAll(this, "TAP FOR SOS")
        handler.postDelayed({ if (!isFinishing) finish() }, 250L)
    }

    private fun completeSos() {
        if (completed) return
        completed = true
        holdStartedAt = 0L
        handler.removeCallbacks(progressRunnable)
        // Restore the widget immediately. Completing the hold must NOT open
        // the React Native app screen. The SOS is dispatched to an already
        // running RN runtime when possible; otherwise the durable pending flag
        // is consumed by the JS startup bridge when RN becomes ready.
        SosWidgetProvider.updateAll(this, "TAP FOR SOS")

        val prefs = getSharedPreferences("cogg_power_trigger", MODE_PRIVATE)
        prefs.edit().putBoolean("pending", true).apply()
        dispatchToReactIfReady(prefs)

        // Always return to the launcher/widget. There is intentionally no
        // startActivity(MainActivity) here.
        finish()
    }


    private fun dispatchToReactIfReady(prefs: android.content.SharedPreferences) {
        val reactContext = (application as? ReactApplication)?.reactHost?.currentReactContext
        if (reactContext == null) return
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("powerButtonSosTrigger", Arguments.createMap())
    }
    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private object SystemClockCompat {
        fun elapsedRealtime(): Long = android.os.SystemClock.elapsedRealtime()
    }
}
