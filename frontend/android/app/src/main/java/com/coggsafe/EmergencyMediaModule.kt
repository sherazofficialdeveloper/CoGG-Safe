package com.coggsafe

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.telecom.PhoneAccountHandle
import android.media.MediaPlayer
import android.telecom.TelecomManager
import android.telephony.SmsManager
import android.location.Location
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.provider.Settings
import android.location.LocationManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.android.gms.location.CurrentLocationRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executor

/**
 * Foreground-only native media boundary for an active SOS.
 *
 * CameraX requires a visible Activity lifecycle. Android does not permit
 * us to truthfully claim silent camera capture from a backgrounded process.
 */
class EmergencyMediaModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private var fallbackMediaPlayer: MediaPlayer? = null

    private val executor: Executor =
        ContextCompat.getMainExecutor(reactContext)

    private val smsStatusReceiver by lazy {
        object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                val action = intent.action ?: return
                val resultCode = getResultCode()
                val stage = when (action) {
                    "SOS_SMS_SENT" -> "sent"
                    "SOS_SMS_DELIVERED" -> "delivered"
                    else -> "unknown"
                }

                val status = when (resultCode) {
                    Activity.RESULT_OK -> "success"
                    SmsManager.RESULT_ERROR_GENERIC_FAILURE,
                    SmsManager.RESULT_ERROR_NO_SERVICE,
                    SmsManager.RESULT_ERROR_NULL_PDU,
                    SmsManager.RESULT_ERROR_RADIO_OFF -> "failed"
                    else -> "failed"
                }

                val reason = when (resultCode) {
                    Activity.RESULT_OK -> "SMS ${stage} successfully."
                    SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "SMS ${stage} failed: generic failure."
                    SmsManager.RESULT_ERROR_NO_SERVICE -> "SMS ${stage} failed: no cellular service."
                    SmsManager.RESULT_ERROR_NULL_PDU -> "SMS ${stage} failed: null PDU."
                    SmsManager.RESULT_ERROR_RADIO_OFF -> "SMS ${stage} failed: radio is off."
                    else -> "SMS ${stage} failed."
                }

                val payload = Arguments.createMap().apply {
                    putString("stage", stage)
                    putString("status", status)
                    putString("reason", reason)
                    putInt("resultCode", resultCode)
                }
                reactContext
                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                    .emit("sosSmsStatus", payload)
            }
        }
    }

    private var smsStatusReceiverRegistered = false

    override fun getName(): String = "EmergencyMedia"

    private fun emitDiagnostic(message: String, type: String = "info") {
        val payload = Arguments.createMap().apply {
            putString("message", message)
            putString("type", type)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("sosNativeDiagnostic", payload)
    }

    private fun ensureSmsStatusReceiverRegistered() {
        if (smsStatusReceiverRegistered) return
        val filter = IntentFilter().apply {
            addAction("SOS_SMS_SENT")
            addAction("SOS_SMS_DELIVERED")
        }
        ContextCompat.registerReceiver(reactContext.applicationContext, smsStatusReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        smsStatusReceiverRegistered = true
    }

    // ================= NEW: Check if location is enabled =================
    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        try {
            val locationManager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
            val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
            val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
            promise.resolve(isGpsEnabled || isNetworkEnabled)
        } catch (e: Exception) {
            Log.e("EmergencyMedia", "isLocationEnabled error: ${e.message}")
            promise.resolve(false)
        }
    }

    // ================= NEW: Prompt user to enable location =================
    @ReactMethod
    fun promptEnableLocation(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("EmergencyMedia", "promptEnableLocation error: ${e.message}")
            promise.resolve(false)
        }
    }

    // ================= Open this app's Android settings =================
    @ReactMethod
    fun openAppDetailsSettings(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${reactContext.packageName}")
            ).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e("EmergencyMedia", "openAppDetailsSettings error: ${e.message}")
            promise.resolve(false)
        }
    }

    // ================= NEW: Get Active SIM Count =================
    @ReactMethod
    fun getActiveSimCount(promise: Promise) {
        try {
            val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
            val active = subscriptionManager?.activeSubscriptionInfoList ?: emptyList()
            val count = active.size
            promise.resolve(count)
        } catch (e: Exception) {
            Log.e("EmergencyMedia", "getActiveSimCount error: ${e.message}")
            promise.resolve(0)
        }
    }

    // ================= NEW: Get Default SIM ID =================
    @ReactMethod
    fun getDefaultSimId(promise: Promise) {
        try {
            val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
            val active = subscriptionManager?.activeSubscriptionInfoList ?: emptyList()
            
            if (active.isEmpty()) {
                promise.resolve(-1)
                return
            }

            // Prefer the system default SMS subscription. Fall back to the
            // default voice subscription only when Android does not expose a
            // usable SMS default on the device.
            val defaultId = try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    SubscriptionManager.getDefaultSmsSubscriptionId()
                } else {
                    -1
                }
            } catch (e: Exception) {
                -1
            }

            // If default is valid and active, return it
            if (defaultId >= 0 && active.any { it.subscriptionId == defaultId }) {
                promise.resolve(defaultId)
                return
            }

            // Otherwise return first SIM (slot 0)
            val firstSim = active.firstOrNull()
            if (firstSim != null) {
                promise.resolve(firstSim.subscriptionId)
            } else {
                promise.resolve(-1)
            }
        } catch (e: Exception) {
            Log.e("EmergencyMedia", "getDefaultSimId error: ${e.message}")
            promise.resolve(-1)
        }
    }

    // ================= EXISTING: Capture Photos =================
    @ReactMethod
    fun capturePhotos(
        sosId: String,
        captureFront: Boolean,
        captureBack: Boolean,
        promise: Promise
    ) {
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("E_CAMERA_PERMISSION", "Camera permission is not granted.")
            return
        }
        val owner = reactContext.currentActivity as? LifecycleOwner
        if (owner == null) {
            promise.reject(
                "E_NO_FOREGROUND_ACTIVITY",
                "Camera capture requires the SOS app to be in the foreground."
            )
            return
        }

        val directory = File(reactContext.filesDir, "sos-media/$sosId").apply { mkdirs() }
        val result = Arguments.createMap()

        try {
            val future = ProcessCameraProvider.getInstance(reactContext)
            future.addListener({
                try {
                    val provider = future.get()
                    val finish = { front: File?, frontError: String?, back: File?, backError: String? ->
                        if (front != null) result.putString("frontImagePath", front.absolutePath)
                        else if (captureFront) result.putString("frontError", frontError ?: "Front camera failed.")
                        if (back != null) result.putString("backImagePath", back.absolutePath)
                        else if (captureBack) result.putString("backError", backError ?: "Back camera failed.")
                        result.putString("status", if ((!captureFront || front != null) && (!captureBack || back != null)) "completed" else if (front != null || back != null) "partial" else "failed")
                        promise.resolve(result)
                    }

                    fun captureBackIfNeeded(front: File?, frontError: String?) {
                        if (!captureBack) {
                            finish(front, frontError, null, null)
                            return
                        }
                        captureLensWithRetry(provider, owner, CameraSelector.LENS_FACING_BACK, File(directory, "back-${System.currentTimeMillis()}.jpg"), 8) { back, backError ->
                            finish(front, frontError, back, backError)
                        }
                    }

                    if (captureFront) {
                        captureLensWithRetry(provider, owner, CameraSelector.LENS_FACING_FRONT, File(directory, "front-${System.currentTimeMillis()}.jpg"), 8) { front, frontError ->
                            captureBackIfNeeded(front, frontError)
                        }
                    } else {
                        captureBackIfNeeded(null, null)
                    }
                } catch (error: Exception) {
                    promise.reject("E_CAMERA_CAPTURE", "Unable to initialize the SOS camera.", error)
                }
            }, executor)
        } catch (error: Exception) {
            promise.reject("E_CAMERA_CAPTURE", "Unable to access the SOS camera.", error)
        }
    }

    private fun captureLensWithRetry(
        provider: ProcessCameraProvider,
        owner: LifecycleOwner,
        lens: Int,
        output: File,
        attemptsLeft: Int,
        callback: (File?, String?) -> Unit
    ) {
        captureCamera(provider, owner, lens, output) { file, error ->
            if (file != null) {
                callback(file, null)
            } else if (attemptsLeft > 1) {
                Handler(Looper.getMainLooper()).postDelayed({
                    captureLensWithRetry(provider, owner, lens, output, attemptsLeft - 1, callback)
                }, 650L)
            } else {
                callback(null, error)
            }
        }
    }

    private fun captureCamera(
        provider: ProcessCameraProvider,
        owner: LifecycleOwner,
        lens: Int,
        output: File,
        callback: (File?, String?) -> Unit
    ) {
        try {
            provider.unbindAll()
            Handler(Looper.getMainLooper()).postDelayed({
              try {
                val selector = CameraSelector.Builder()
                    .requireLensFacing(lens)
                    .build()

                if (!provider.hasCamera(selector)) {
                    callback(null, if (lens == CameraSelector.LENS_FACING_FRONT) "Front camera is not available." else "Back camera is not available.")
                    return@postDelayed
                }

                val imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .setJpegQuality(90)
                    .build()

                provider.bindToLifecycle(owner, selector, imageCapture)

                val outputOptions = ImageCapture.OutputFileOptions.Builder(output).build()
                imageCapture.takePicture(outputOptions, executor, object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                    if (isUsableMediaFile(output)) {
                        try { provider.unbindAll() } catch (_: Exception) {}
                        callback(output, null)
                    } else {
                        try { provider.unbindAll() } catch (_: Exception) {}
                        callback(null, "Captured image file is missing, unreadable, or empty.")
                    }
                }

                override fun onError(exception: ImageCaptureException) {
                    try { provider.unbindAll() } catch (_: Exception) {}
                    callback(null, exception.message ?: "Camera capture failed.")
                }
            })
              } catch (error: Exception) {
                callback(null, error.message ?: "Camera capture failed.")
              }
            }, 900L)
        } catch (error: Exception) {
            callback(null, error.message ?: "Camera capture failed.")
        }
    }

    // ================= FIXED: Send Emergency SMS with Auto SIM =================
    @ReactMethod
    fun sendEmergencySms(
        phoneNumber: String,
        message: String,
        preferredSubscriptionId: Int,
        promise: Promise
    ) {
        Log.i("EmergencyMedia", "[SOS][SMS] native send requested")
        emitDiagnostic("SMS DEBUG — Native SMS method reached")
        val cleanNumber = phoneNumber.trim()
        if (cleanNumber.isEmpty()) {
            promise.reject("E_SMS_NUMBER", "Emergency SMS number is missing.")
            return
        }

        // Check SEND_SMS permission
        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.SEND_SMS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w("EmergencyMedia", "[SOS][SMS] SEND_SMS permission denied")
            promise.reject(
                "E_SMS_PERMISSION",
                "SEND_SMS permission is required to send the emergency message."
            )
            return
        }

        try {
            ensureSmsStatusReceiverRegistered()

            // ================= AUTO SIM 1 ONLY =================
            // SOS must never use Android's default SIM or show a SIM chooser.
            // Slot 0 is Android's SIM 1. If SIM 1 is not active, fail instead
            // of silently routing the emergency SMS through another SIM.
            val subscriptionId = resolveSimOneSubscriptionId()
            if (subscriptionId < 0) {
                throw IllegalStateException("SIM 1 is not available on this device.")
            }
            Log.i("EmergencyMedia", "[SOS][SMS] Auto-selected SIM 1 subscriptionId=$subscriptionId")

            val smsManager = android.telephony.SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
            Log.i("EmergencyMedia", "[SOS][SMS] SmsManager initialized subscriptionId=$subscriptionId")

            val sentAction = Intent("SOS_SMS_SENT").apply {
                setPackage(reactContext.packageName)
            }
            val deliveredAction = Intent("SOS_SMS_DELIVERED").apply {
                setPackage(reactContext.packageName)
            }

            val sentIntent = PendingIntent.getBroadcast(
                reactContext,
                (System.currentTimeMillis() % 10000).toInt(),
                sentAction,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val deliveredIntent = PendingIntent.getBroadcast(
                reactContext,
                (System.currentTimeMillis() % 10000).toInt() + 1,
                deliveredAction,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            emitDiagnostic("SMS DEBUG — SmsManager send attempt")
            smsManager.sendTextMessage(
                cleanNumber,
                null,
                message.ifBlank { "Emergency assistance requested." },
                sentIntent,
                deliveredIntent
            )
            Log.i("EmergencyMedia", "[SOS][SMS] sendTextMessage attempted")
            Log.i("EmergencyMedia", "[SOS][SMS] SmsManager.sendTextMessage accepted")

            promise.resolve(Arguments.createMap().apply {
                putString("status", "sent")
                putString("reason", "Emergency SMS queued for delivery via carrier network.")
                putInt("subscriptionId", subscriptionId)
            })
        } catch (error: Exception) {
            promise.reject(
                "E_SMS_SEND",
                "Android could not send the emergency SMS: ${error.message}",
                error
            )
        }
    }

    // ================= EXISTING: Get Available SIMs =================
    @ReactMethod
    fun getAvailableSims(promise: Promise) {
        try {
            val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
            val active = subscriptionManager?.activeSubscriptionInfoList ?: emptyList()
            val sortedActive = active.sortedBy { it.simSlotIndex }

            val result = Arguments.createArray()
            sortedActive.forEach { info ->
                result.pushMap(Arguments.createMap().apply {
                    putInt("subscriptionId", info.subscriptionId)
                    putInt("slotIndex", info.simSlotIndex)
                    putString("displayName", info.displayName?.toString() ?: "SIM ${info.simSlotIndex + 1}")
                    putString("carrierName", info.carrierName?.toString() ?: "")
                    putBoolean("isDefault", info.simSlotIndex == 0)
                })
            }
            promise.resolve(result)
        } catch (error: Exception) {
            promise.resolve(Arguments.createArray())
        }
    }

    // ================= EXISTING: Place Call =================
    @ReactMethod
    fun placeCall(
        phoneNumber: String,
        preferredSubscriptionId: Int,
        promise: Promise
    ) {
        Log.i("EmergencyMedia", "[SOS][CALL] native call requested")
        emitDiagnostic("CALL DEBUG — Native placeCall() reached")
        val cleanNumber = phoneNumber.trim()
        if (cleanNumber.isEmpty()) {
            promise.reject("E_CALL_NUMBER", "Emergency call number is missing.")
            return
        }

        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.CALL_PHONE
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w("EmergencyMedia", "[SOS][CALL] CALL_PHONE permission denied")
            emitDiagnostic("CALL_NATIVE 01: CALL_PHONE denied", "error")
            promise.reject(
                "E_CALL_PERMISSION",
                "CALL_PHONE permission is required to place the emergency call from the user device."
            )
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            emitDiagnostic("CALL_NATIVE 02: no foreground Activity", "error")
            promise.reject(
                "E_CALL_NO_ACTIVITY",
                "Emergency calling requires an active Android activity."
            )
            return
        }

        try {
            // Do not use ACTION_DIAL or a SIM chooser. TelecomManager receives the
            // exact PhoneAccountHandle so Android can place the call immediately
            // through the selected SIM subscription. The system in-call UI may still
            // appear because telephony is controlled by Android/carrier.
            val telecomManager = reactContext.getSystemService(TelecomManager::class.java)
            if (telecomManager == null) {
                throw IllegalStateException("Telecom service is unavailable on this device.")
            }

            val selectedSubscriptionId = resolveSimOneSubscriptionId()
            if (selectedSubscriptionId < 0) {
                throw IllegalStateException("SIM 1 is not available on this device.")
            }
            val phoneAccount = findPhoneAccountForSubscription(telecomManager, selectedSubscriptionId)
                ?: throw IllegalStateException("Android did not expose a call account for SIM 1.")

            val callUri = Uri.parse("tel:$cleanNumber")
            val extras = android.os.Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, phoneAccount)
            }
            Log.i("EmergencyMedia", "[SOS][CALL] Auto-selected SIM 1 subscriptionId=$selectedSubscriptionId account=${phoneAccount.id}")
            emitDiagnostic("CALL_NATIVE 03: SIM 1 selected")

            telecomManager.placeCall(callUri, extras)
            Log.i("EmergencyMedia", "[SOS][CALL] TelecomManager.placeCall requested")
            emitDiagnostic("CALL_NATIVE 05: direct Telecom call request accepted")
            promise.resolve(Arguments.createMap().apply {
                putString("status", "initiated")
                putString("reason", "Android accepted the direct emergency call request. No SIM chooser was opened.")
                putInt("subscriptionId", selectedSubscriptionId)
            })
        } catch (error: Exception) {
            Log.e("EmergencyMedia", "[SOS][CALL] direct Telecom call failed", error)
            emitDiagnostic("CALL_NATIVE 07: direct call failed: ${error.message}", "error")
            promise.reject(
                "E_CALL_LAUNCH",
                "Android could not place the emergency call: ${error.message}",
                error
            )
        }
    }

    /**
     * Returns the subscription in physical SIM slot 1 first, then slot 2.
     * This is deliberately slot-based rather than default-SIM based so SOS never
     * opens a chooser or silently follows the user's unrelated default SMS/voice SIM.
     */
    private fun getActiveSubscriptionsBySlot(): List<android.telephony.SubscriptionInfo> {
        return try {
            val manager = reactContext.getSystemService(SubscriptionManager::class.java)
            manager?.activeSubscriptionInfoList
                ?.sortedBy { it.simSlotIndex }
                ?: emptyList()
        } catch (error: Exception) {
            Log.w("EmergencyMedia", "[SOS][SIM] Could not enumerate active subscriptions", error)
            emptyList()
        }
    }

    private fun resolveSimOneSubscriptionId(): Int {
        return getActiveSubscriptionsBySlot()
            .firstOrNull { it.simSlotIndex == 0 }
            ?.subscriptionId
            ?: -1
    }

    private fun findPhoneAccountForSubscription(telecomManager: TelecomManager, subscriptionId: Int): PhoneAccountHandle? {
        if (subscriptionId < 0) return null
        return try {
            val telephonyManager = reactContext.getSystemService(TelephonyManager::class.java)
            telecomManager.callCapablePhoneAccounts.firstOrNull { handle ->
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    try {
                        telephonyManager?.getSubscriptionId(handle) == subscriptionId
                    } catch (_: SecurityException) {
                        handle.id == subscriptionId.toString()
                    }
                } else {
                    handle.id == subscriptionId.toString()
                }
            }
        } catch (error: Exception) {
            Log.w("EmergencyMedia", "[SOS][CALL] Could not match SIM 1 PhoneAccountHandle", error)
            null
        }
    }

    private fun resolveSmsSubscriptionId(preferredSubscriptionId: Int): Int {
        return try {
            val manager = reactContext.getSystemService(SubscriptionManager::class.java)
            val active = manager?.activeSubscriptionInfoList ?: emptyList()
            if (active.isEmpty()) return -1

            if (preferredSubscriptionId >= 0) {
                active.firstOrNull { it.subscriptionId == preferredSubscriptionId }?.let { return it.subscriptionId }
            }

            val defaultSms = try { SubscriptionManager.getDefaultSmsSubscriptionId() } catch (_: Exception) { -1 }
            active.firstOrNull { it.subscriptionId == defaultSms }?.let { return it.subscriptionId }
            active.firstOrNull { it.simSlotIndex == 0 }?.let { return it.subscriptionId }
            active.first().subscriptionId
        } catch (_: Exception) {
            -1
        }
    }

    // ================= EXISTING: Start Live Location Service =================
    @ReactMethod
    fun startLiveLocationService(
        baseUrl: String,
        token: String,
        backendSosId: String,
        promise: Promise
    ) {
        if (baseUrl.isBlank() || token.isBlank() || backendSosId.isBlank()) {
            promise.reject("E_LIVE_LOCATION_CONFIG", "Live location service requires baseUrl, token and backend SOS id.")
            return
        }
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            promise.reject("E_LOCATION_PERMISSION", "Location permission is required for live location.")
            return
        }

        try {
            val intent = Intent(reactContext, LiveLocationForegroundService::class.java).apply {
                putExtra(LiveLocationForegroundService.EXTRA_BASE_URL, baseUrl.trimEnd('/'))
                putExtra(LiveLocationForegroundService.EXTRA_TOKEN, token)
                putExtra(LiveLocationForegroundService.EXTRA_SOS_ID, backendSosId)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(reactContext, intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(Arguments.createMap().apply { putString("status", "started") })
        } catch (error: Exception) {
            promise.reject("E_LIVE_LOCATION_START", "Unable to start live location service: ${error.message}", error)
        }
    }

    // ================= EXISTING: Stop Live Location Service =================
    @ReactMethod
    fun stopLiveLocationService(promise: Promise) {
        try {
            reactContext.stopService(Intent(reactContext, LiveLocationForegroundService::class.java))
            promise.resolve(Arguments.createMap().apply { putString("status", "stopped") })
        } catch (error: Exception) {
            promise.reject("E_LIVE_LOCATION_STOP", "Unable to stop live location service.", error)
        }
    }

    // ================= EXISTING: Get Current Location =================
    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        val fine = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val coarse = ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!fine && !coarse) {
            promise.reject("E_LOCATION_PERMISSION", "Location permission is not granted.")
            return
        }

        try {
            val client = LocationServices.getFusedLocationProviderClient(reactContext)
            val request = CurrentLocationRequest.Builder()
                .setPriority(if (fine) Priority.PRIORITY_HIGH_ACCURACY else Priority.PRIORITY_BALANCED_POWER_ACCURACY)
                .setMaxUpdateAgeMillis(15_000L)
                .setDurationMillis(8_000L)
                .build()
            val cancellation = CancellationTokenSource()
            client.getCurrentLocation(request, cancellation.token)
                .addOnSuccessListener { location ->
                    if (location == null) {
                        promise.resolve(null)
                        return@addOnSuccessListener
                    }
                    promise.resolve(Arguments.createMap().apply {
                        putDouble("latitude", location.latitude)
                        putDouble("longitude", location.longitude)
                        if (location.hasAccuracy()) putDouble("accuracy", location.accuracy.toDouble()) else putNull("accuracy")
                        putDouble("capturedAt", location.time.toDouble())
                        putString("source", "fused")
                    })
                }
                .addOnFailureListener { error ->
                    promise.reject("E_LOCATION_CURRENT", "Unable to obtain current location.", error)
                }
        } catch (error: SecurityException) {
            promise.reject("E_LOCATION_PERMISSION", "Location permission is not granted.", error)
        } catch (error: Exception) {
            promise.reject("E_LOCATION_CURRENT", "Unable to obtain current location.", error)
        }
    }

    // ================= EXISTING: Download Authenticated Media =================
    @ReactMethod
    fun downloadAuthenticatedMedia(
        mediaUrl: String,
        token: String,
        promise: Promise
    ) {
        if (mediaUrl.isBlank()) {
            promise.reject("E_MEDIA_AUTH", "A media URL is required.")
            return
        }

        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(mediaUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 15000
                    readTimeout = 30000
                    if (token.isNotBlank()) setRequestProperty("Authorization", "Bearer $token")
                }
                val status = connection.responseCode
                if (status !in 200..299) {
                    throw IllegalStateException("Media request was rejected (HTTP $status).")
                }

                val contentType = connection.contentType?.lowercase().orEmpty()
                if (contentType.startsWith("application/json") || contentType.startsWith("text/")) {
                    throw IllegalStateException("The media endpoint returned a non-media response ($contentType).")
                }

                val extension = when {
                    mediaUrl.contains("/frontImage/") || mediaUrl.contains("/backImage/") -> "jpg"
                    contentType.contains("mpeg") -> "mp3"
                    contentType.contains("wav") -> "wav"
                    contentType.contains("3gpp") -> "3gp"
                    else -> "m4a"
                }
                val fileName = "sos-media-${mediaUrl.hashCode().toUInt().toString(16)}.$extension"
                val file = File(reactContext.filesDir, "protected-sos-media/$fileName")
                file.parentFile?.mkdirs()
                connection.inputStream.use { input ->
                    FileOutputStream(file).use { output -> input.copyTo(output) }
                }
                if (!file.isFile || !file.canRead() || file.length() <= 0) {
                    file.delete()
                    throw IllegalStateException("Downloaded media file is invalid.")
                }
                promise.resolve(file.absolutePath)
            } catch (error: Exception) {
                promise.reject("E_MEDIA_DOWNLOAD", "Unable to download protected SOS media.", error)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }

    // ================= Audio playback fallback =================
    @ReactMethod
    fun getAudioDuration(filePath: String, promise: Promise) {
        if (filePath.isBlank()) {
            promise.reject("E_AUDIO_PATH", "Audio file path is required.")
            return
        }
        try {
            val player = MediaPlayer()
            player.setDataSource(filePath.removePrefix("file://"))
            player.prepare()
            val duration = player.duration
            player.release()
            promise.resolve(duration)
        } catch (error: Exception) {
            promise.reject("E_AUDIO_DURATION", "Unable to read audio duration.", error)
        }
    }

    @ReactMethod
    fun playAudioFile(filePath: String, promise: Promise) {
        if (filePath.isBlank()) {
            promise.reject("E_AUDIO_PATH", "Audio file path is required.")
            return
        }
        try {
            try { fallbackMediaPlayer?.stop() } catch (_: Exception) {}
            try { fallbackMediaPlayer?.release() } catch (_: Exception) {}
            fallbackMediaPlayer = MediaPlayer().apply {
                setDataSource(filePath.removePrefix("file://"))
                setOnPreparedListener { mediaPlayer ->
                    mediaPlayer.start()
                    promise.resolve(true)
                }
                setOnCompletionListener { mediaPlayer ->
                    try { mediaPlayer.release() } catch (_: Exception) {}
                    if (fallbackMediaPlayer === mediaPlayer) fallbackMediaPlayer = null
                }
                setOnErrorListener { mediaPlayer, what, extra ->
                    try { mediaPlayer.release() } catch (_: Exception) {}
                    if (fallbackMediaPlayer === mediaPlayer) fallbackMediaPlayer = null
                    false
                }
                prepareAsync()
            }
        } catch (error: Exception) {
            try { fallbackMediaPlayer?.release() } catch (_: Exception) {}
            fallbackMediaPlayer = null
            promise.reject("E_AUDIO_PLAY", "Unable to play audio file.", error)
        }
    }

    @ReactMethod
    fun stopAudioFile(promise: Promise) {
        try {
            try { fallbackMediaPlayer?.stop() } catch (_: Exception) {}
            try { fallbackMediaPlayer?.release() } catch (_: Exception) {}
            fallbackMediaPlayer = null
            promise.resolve(true)
        } catch (error: Exception) {
            fallbackMediaPlayer = null
            promise.reject("E_AUDIO_STOP", "Unable to stop audio.", error)
        }
    }

    // ================= EXISTING: Record Audio =================
    @ReactMethod
    fun recordAudio(
        sosId: String,
        durationMs: Int,
        promise: Promise
    ) {
        val file = File(
            reactContext.filesDir,
            "sos-media/$sosId/audio-${System.currentTimeMillis()}.m4a"
        )

        file.parentFile?.mkdirs()

        var recorder: android.media.MediaRecorder? = null

        try {
            recorder = android.media.MediaRecorder().apply {
                setAudioSource(android.media.MediaRecorder.AudioSource.MIC)
                setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(file.absolutePath)

                prepare()
                start()
            }

            val activeRecorder = recorder

            Handler(Looper.getMainLooper()).postDelayed(
                {
                    try {
                        activeRecorder.stop()
                        activeRecorder.release()

                        if (!isUsableMediaFile(file)) {
                            throw IllegalStateException("Recorded audio file is missing, unreadable, or empty.")
                        }
                        promise.resolve(file.absolutePath)
                    } catch (error: Exception) {
                        try {
                            activeRecorder.release()
                        } catch (_: Exception) {
                            // Ignore release failure.
                        }

                        file.delete()

                        promise.reject(
                            "E_AUDIO_RECORDING",
                            "SOS audio recording failed.",
                            error
                        )
                    }
                },
                durationMs.toLong()
            )
        } catch (error: Exception) {
            try {
                recorder?.release()
            } catch (_: Exception) {
                // Ignore release failure.
            }

            file.delete()

            promise.reject(
                "E_AUDIO_RECORDING",
                "Unable to start SOS audio recording.",
                error
            )
        }
    }

    private fun isUsableMediaFile(file: File): Boolean {
        return file.exists() && file.isFile && file.canRead() && file.length() > 0L
    }

    @ReactMethod
    fun validateMediaFile(path: String, promise: Promise) {
        promise.resolve(isUsableMediaFile(File(path.removePrefix("file://"))))
    }

    // ================= EXISTING: Get Telephony State =================
    @ReactMethod
    fun getTelephonyState(promise: Promise) {
        try {
            val telephonyManager = reactContext.getSystemService(android.telephony.TelephonyManager::class.java)
            val simState = telephonyManager?.simState ?: android.telephony.TelephonyManager.SIM_STATE_UNKNOWN
            val hasActiveSubscription = resolveSmsSubscriptionId(-1) >= 0

            val status: String
            val reason: String
            when {
                simState == android.telephony.TelephonyManager.SIM_STATE_ABSENT -> {
                    status = "UNSUPPORTED"
                    reason = "No SIM card is installed."
                }
                simState == android.telephony.TelephonyManager.SIM_STATE_PIN_REQUIRED ||
                    simState == android.telephony.TelephonyManager.SIM_STATE_PUK_REQUIRED ||
                    simState == android.telephony.TelephonyManager.SIM_STATE_NETWORK_LOCKED -> {
                    status = "UNSUPPORTED"
                    reason = "SIM card is locked."
                }
                hasActiveSubscription -> {
                    status = "AVAILABLE"
                    reason = "SIM/cellular service is available."
                }
                else -> {
                    status = "TEMPORARILY_UNAVAILABLE"
                    reason = "Cellular service is temporarily unavailable."
                }
            }

            promise.resolve(Arguments.createMap().apply {
                putString("status", status)
                putString("reason", reason)
                putBoolean("hasActiveSubscription", hasActiveSubscription)
            })
        } catch (error: Exception) {
            promise.resolve(Arguments.createMap().apply {
                putString("status", "AVAILABLE")
                putString("reason", "Telephony state check failed; assuming available.")
                putBoolean("hasActiveSubscription", true)
            })
        }
    }

}