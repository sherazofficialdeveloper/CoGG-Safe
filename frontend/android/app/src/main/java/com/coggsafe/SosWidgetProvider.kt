package com.coggsafe

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.util.TypedValue

/** Home-screen CoGG Safe SOS widget. */
class SosWidgetProvider : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
        ids.forEach { updateWidget(context, manager, it) }
    }

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        updateAll(context)
    }

    companion object {
        const val ACTION_WIDGET_SOS = "com.coggsafe.action.WIDGET_SOS"

        fun updateAll(context: Context, hint: String = "TAP FOR SOS") {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, SosWidgetProvider::class.java)
            manager.getAppWidgetIds(component).forEach { id ->
                updateWidget(context, manager, id, hint)
            }
        }

        private fun updateWidget(
            context: Context,
            manager: AppWidgetManager,
            appWidgetId: Int,
            hint: String = "TAP FOR SOS",
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_sos)
            views.setTextViewText(R.id.widget_sos, "SOS\n$hint")

            // Keep the SOS control circular and scale it from the widget's
            // current height/width. Android 12+ exposes these size ranges in
            // AppWidgetOptions; the provider reapplies the layout whenever
            // the launcher resizes the widget.
            val options = manager.getAppWidgetOptions(appWidgetId)
            val minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250)
            val minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 140)
            val circleSize = (minOf(minWidth, minHeight) - 20).coerceAtLeast(64)
            views.setViewLayoutWidth(R.id.widget_sos, circleSize.toFloat(), TypedValue.COMPLEX_UNIT_DIP)
            views.setViewLayoutHeight(R.id.widget_sos, circleSize.toFloat(), TypedValue.COMPLEX_UNIT_DIP)

            val intent = Intent(context, SosWidgetReceiver::class.java).apply {
                action = ACTION_WIDGET_SOS
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
                putExtra("widget_width_dp", minWidth)
                putExtra("widget_height_dp", minHeight)
            }
            val pendingIntent = PendingIntent.getBroadcast(
                context,
                appWidgetId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_sos, pendingIntent)
            manager.updateAppWidget(appWidgetId, views)
        }
    }
}
