package com.coggsafe

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager

/**
 * Invisible cold-start bridge for the volume SOS trigger.
 *
 * This activity never renders a user-facing CoGG Safe screen. It exists only
 * because the existing SOS implementation is React Native/JS based and a
 * completely dead app process has no JS runtime to execute it. The pending
 * trigger is consumed by App.js once the bridge is ready; this transparent
 * host then finishes and returns the user to whatever screen was underneath.
 */
class SosVolumeBootstrapActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.setBackgroundDrawableResource(android.R.color.transparent)
        window.addFlags(
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        )

        // Start the real RN Activity behind this invisible bridge. The normal
        // Activity is not shown because this bridge stays on top until the JS
        // trigger has been delivered, then immediately closes itself.
        try {
            val mainIntent = intent.setClass(this, MainActivity::class.java).apply {
                action = SosVolumeAccessibilityService.ACTION_VOLUME_SOS_TRIGGER
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                    android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    android.content.Intent.FLAG_ACTIVITY_NO_ANIMATION)
            }
            startActivity(mainIntent)
        } catch (_: Exception) {
            finish()
            return
        }

        Handler(Looper.getMainLooper()).postDelayed({
            if (!isFinishing) finish()
        }, 1200L)
    }
}
