package com.coggsafe

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
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
    createDefaultNotificationChannel()
    loadReactNative(this)
  }

  private fun createDefaultNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val channelId = getString(R.string.default_notification_channel_id)
    val channelName = getString(R.string.default_notification_channel_name)
    val channelDescription = getString(R.string.default_notification_channel_description)
    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    val channel = NotificationChannel(
      channelId,
      channelName,
      NotificationManager.IMPORTANCE_DEFAULT,
    ).apply {
      description = channelDescription
    }

    manager.createNotificationChannel(channel)
  }
}
