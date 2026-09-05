package com.coggsafe

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject
import java.net.HttpURLConnection
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.net.URL
import java.util.concurrent.Executors

/**
 * Real Android foreground service for SOS live location.
 * It continues running when React Native JS is backgrounded/suspended.
 */
class LiveLocationForegroundService : Service() {
    companion object {
        const val EXTRA_BASE_URL = "baseUrl"
        const val EXTRA_TOKEN = "token"
        const val EXTRA_SOS_ID = "sosId"
        private const val CHANNEL_ID = "coggsafe_live_location"
        private const val NOTIFICATION_ID = 4107
        private const val MAX_DURATION_MS = 3 * 60 * 60 * 1000L
    }

    private lateinit var fusedClient: FusedLocationProviderClient
    private val networkExecutor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var baseUrl = ""
    private var token = ""
    private var sosId = ""

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.lastLocation?.let { location -> sendLocation(location) }
        }
    }

    override fun onCreate() {
        super.onCreate()
        fusedClient = LocationServices.getFusedLocationProviderClient(this)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        baseUrl = intent?.getStringExtra(EXTRA_BASE_URL).orEmpty().trimEnd('/')
        token = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
        sosId = intent?.getStringExtra(EXTRA_SOS_ID).orEmpty()

        if (baseUrl.isBlank() || token.isBlank() || sosId.isBlank()) {
            stopSelf()
            return START_NOT_STICKY
        }

        startAsForeground()
        startLocationUpdates()

        handler.removeCallbacksAndMessages(null)
        handler.postDelayed({ stopSelf() }, MAX_DURATION_MS)
        return START_NOT_STICKY
    }

    private fun startAsForeground() {
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("CoGG Safe")
            .setContentText("Live emergency location sharing is active")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startLocationUpdates() {
        val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            stopSelf()
            return
        }

        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L)
            .setMinUpdateIntervalMillis(5_000L)
            .setMaxUpdateDelayMillis(15_000L)
            .setWaitForAccurateLocation(false)
            .build()

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
        } catch (_: SecurityException) {
            stopSelf()
        }
    }

    private fun isoTime(timeMs: Long): String {
        val format = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        format.timeZone = TimeZone.getTimeZone("UTC")
        return format.format(Date(timeMs))
    }

    private fun sendLocation(location: android.location.Location) {
        if (location.latitude !in -90.0..90.0 || location.longitude !in -180.0..180.0) return

        val payload = JSONObject().apply {
            put("latitude", location.latitude)
            put("longitude", location.longitude)
            put("accuracy", if (location.hasAccuracy()) location.accuracy else JSONObject.NULL)
            put("capturedAt", isoTime(location.time))
            put("source", "fused")
        }.toString()

        networkExecutor.execute {
            var connection: HttpURLConnection? = null
            try {
                val endpoint = "$baseUrl/sos/$sosId/live-location/ping"
                connection = (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 10_000
                    readTimeout = 10_000
                    doOutput = true
                    setRequestProperty("Authorization", "Bearer $token")
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("Accept", "application/json")
                }
                connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }
                val status = connection.responseCode
                if (status == 401 || status == 403 || status == 404 || status == 409) {
                    handler.post { stopSelf() }
                }
            } catch (_: Exception) {
                // Location updates continue; a later fix can succeed when network returns.
            } finally {
                connection?.disconnect()
            }
        }
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        try { fusedClient.removeLocationUpdates(locationCallback) } catch (_: Exception) { }
        networkExecutor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Emergency live location",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows while CoGG Safe is sharing emergency live location."
            }
        )
    }
}
