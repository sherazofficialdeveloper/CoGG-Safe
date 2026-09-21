package com.coggsafe

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.appwidget.AppWidgetManager

/**
 * Opens the small hold-to-confirm surface from the home-screen widget.
 * Standard RemoteViews cannot receive ACTION_DOWN/ACTION_UP directly, so the
 * hold gesture is completed inside this transparent activity.
 */
class SosWidgetReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != SosWidgetProvider.ACTION_WIDGET_SOS) return

        val launchIntent = Intent(context, SosWidgetHoldActivity::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID))
            putExtra("widget_width_dp", intent.getIntExtra("widget_width_dp", 250))
            putExtra("widget_height_dp", intent.getIntExtra("widget_height_dp", 140))
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_NO_ANIMATION
            )
        }
        context.startActivity(launchIntent)
        SosWidgetProvider.updateAll(context, "SOS SCREEN OPEN")
    }
}
