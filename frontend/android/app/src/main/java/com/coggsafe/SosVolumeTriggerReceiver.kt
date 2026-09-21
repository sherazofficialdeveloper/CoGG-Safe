package com.coggsafe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.ReactApplication
import com.facebook.react.bridge.Arguments
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Bridges the global Volume-Down x3 event from the isolated accessibility
 * process into the already-running React Native process without launching the
 * app UI. This is deliberately a manifest receiver so it also works while
 * MainActivity is backgrounded or the screen is locked.
 */
class SosVolumeTriggerReceiver : BroadcastReceiver() {
    private val handler = Handler(Looper.getMainLooper())

    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != SosVolumeAccessibilityService.ACTION_VOLUME_SOS_BRIDGE) return

        val app = context.applicationContext as? ReactApplication
        if (app == null) return

        emitWhenReactIsReady(app, context.applicationContext, 0)
    }

    private fun emitWhenReactIsReady(app: ReactApplication, context: Context, attempt: Int) {
        val reactContext = try {
            app.reactHost?.currentReactContext
        } catch (_: Exception) {
            null
        }

        if (reactContext != null) {
            reactContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("powerButtonSosTrigger", Arguments.createMap())
            return
        }

        // A cold main process may need a short amount of time for React Native
        // to initialise. Never bring the normal MainActivity to the foreground.
        // If this is a genuine cold start, use the invisible bootstrap Activity
        // only to initialise the existing RN SOS workflow without showing the
        // app UI to the user.
        if (attempt < 20) {
            handler.postDelayed({ emitWhenReactIsReady(app, context, attempt + 1) }, 150L)
        } else {
            try {
                val bootstrap = Intent(context, SosVolumeBootstrapActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
                    putExtra("volume_sos_trigger", true)
                }
                context.startActivity(bootstrap)
            } catch (_: Exception) {
                // Pending flag remains durable; the next normal app startup
                // will consume it if the OEM blocks background activity starts.
            }
        }
    }
}
