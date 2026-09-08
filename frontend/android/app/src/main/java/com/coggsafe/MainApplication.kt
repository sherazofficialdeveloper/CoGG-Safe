package com.coggsafe

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.media.AudioAttributes
import android.media.RingtoneManager
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(EmergencyMediaPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannels()
    loadReactNative(this)
  }

  // ================= CREATE ALL NOTIFICATION CHANNELS =================
  private fun createNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // ================= 1. SOS CHANNEL (Highest Priority) =================
    val sosChannel = NotificationChannel(
      "coggsafe_sos",
      "🚨 SOS Alerts",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Emergency SOS alerts - Highest priority"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 500, 300, 400, 300, 500)
      setShowBadge(true)
      enableLights(true)
      lightColor = android.graphics.Color.RED
      
      // ✅ Default system sound
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }

    // ================= 2. GENERAL CHANNEL (Default) =================
    val generalChannel = NotificationChannel(
      "coggsafe_general",
      "📱 General Notifications",
      NotificationManager.IMPORTANCE_DEFAULT
    ).apply {
      description = "General app notifications"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 200, 100, 200)
      setShowBadge(true)
      
      // ✅ Default system sound
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }

    // ================= 3. SILENT CHANNEL (No Sound) =================
    val silentChannel = NotificationChannel(
      "coggsafe_silent",
      "🔇 Silent Notifications",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Silent notifications - No sound or vibration"
      enableVibration(false)
      setSound(null, null)
    }

    // ================= 4. FCM FALLBACK CHANNEL =================
    val fcmChannel = NotificationChannel(
      "fcm_fallback_notification_channel",
      "CoGG Safe Alerts",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "CoGG Safe emergency alerts"
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 500, 300, 500)
    }

    // ================= 5. DEFAULT CHANNEL (From strings) =================
    val defaultChannelId = getString(R.string.default_notification_channel_id)
    val defaultChannelName = getString(R.string.default_notification_channel_name)
    val defaultChannelDescription = getString(R.string.default_notification_channel_description)

    val defaultChannel = NotificationChannel(
      defaultChannelId,
      defaultChannelName,
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = defaultChannelDescription
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 250, 150, 250)
      setShowBadge(true)
      setSound(
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build()
      )
    }

    // ✅ Create all channels
    manager.createNotificationChannel(sosChannel)
    manager.createNotificationChannel(generalChannel)
    manager.createNotificationChannel(silentChannel)
    manager.createNotificationChannel(fcmChannel)
    manager.createNotificationChannel(defaultChannel)

    android.util.Log.d("Notification", "✅ All notification channels created")
  }
}