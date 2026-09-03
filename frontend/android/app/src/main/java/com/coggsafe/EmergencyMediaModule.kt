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
import android.telecom.TelecomManager
import android.telephony.SmsManager
import android.telephony.SubscriptionManager
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
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
        reactContext.applicationContext.registerReceiver(smsStatusReceiver, filter)
        smsStatusReceiverRegistered = true
    }

    @ReactMethod
    fun capturePhotos(
        sosId: String,
        promise: Promise
    ) {
        // Access the current Activity through ReactApplicationContext.
        val activity = reactContext.currentActivity as? LifecycleOwner

        if (activity == null) {
            promise.reject(
                "E_NO_FOREGROUND_ACTIVITY",
                "Camera capture requires the SOS app to be in the foreground."
            )
            return
        }

        val directory = File(
            reactContext.cacheDir,
            "sos-media/$sosId"
        ).apply {
            mkdirs()
        }

        val result = Arguments.createMap()

        try {
            val cameraProviderFuture =
                ProcessCameraProvider.getInstance(reactContext)

            cameraProviderFuture.addListener(
                {
                    try {
                        val provider = cameraProviderFuture.get()

                        captureCamera(
                            provider = provider,
                            owner = activity,
                            lens = CameraSelector.LENS_FACING_FRONT,
                            output = File(
                                directory,
                                "front-${System.currentTimeMillis()}.jpg"
                            )
                        ) { front, frontError ->

                            if (front != null) {
                                result.putString(
                                    "frontImagePath",
                                    front.absolutePath
                                )
                            } else {
                                result.putString(
                                    "frontError",
                                    frontError
                                )
                            }

                            captureCamera(
                                provider = provider,
                                owner = activity,
                                lens = CameraSelector.LENS_FACING_BACK,
                                output = File(
                                    directory,
                                    "back-${System.currentTimeMillis()}.jpg"
                                )
                            ) { back, backError ->

                                if (back != null) {
                                    result.putString(
                                        "backImagePath",
                                        back.absolutePath
                                    )
                                } else {
                                    result.putString(
                                        "backError",
                                        backError
                                    )
                                }

                                if (front == null && back == null) {
                                    promise.reject(
                                        "E_CAMERA_CAPTURE",
                                        "Both SOS camera captures failed."
                                    )
                                } else {
                                    promise.resolve(result)
                                }
                            }
                        }
                    } catch (error: Exception) {
                        promise.reject(
                            "E_CAMERA_CAPTURE",
                            "Unable to initialize the SOS camera.",
                            error
                        )
                    }
                },
                executor
            )
        } catch (error: Exception) {
            promise.reject(
                "E_CAMERA_CAPTURE",
                "Unable to access the SOS camera.",
                error
            )
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
            val imageCapture = ImageCapture.Builder()
                .setCaptureMode(
                    ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY
                )
                .build()

            provider.unbindAll()

            provider.bindToLifecycle(
                owner,
                CameraSelector.Builder()
                    .requireLensFacing(lens)
                    .build(),
                imageCapture
            )

            val outputOptions =
                ImageCapture.OutputFileOptions.Builder(output).build()

            imageCapture.takePicture(
                outputOptions,
                executor,
                object : ImageCapture.OnImageSavedCallback {

                    override fun onImageSaved(
                        outputFileResults: ImageCapture.OutputFileResults
                    ) {
                        callback(output, null)
                    }

                    override fun onError(
                        exception: ImageCaptureException
                    ) {
                        callback(
                            null,
                            exception.message
                                ?: "Camera capture failed"
                        )
                    }
                }
            )
        } catch (error: Exception) {
            callback(
                null,
                error.message ?: "Camera capture failed"
            )
        }
    }
    @ReactMethod
    fun sendEmergencySms(
        phoneNumber: String,
        message: String,
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

            val subscriptionId = resolvePreferredSubscriptionId()
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (subscriptionId > 0) {
                    android.telephony.SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                } else {
                    android.telephony.SmsManager.getDefault()
                }
            } else {
                android.telephony.SmsManager.getDefault()
            }
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

    @ReactMethod
    fun openSmsComposer(
        phoneNumber: String,
        message: String,
        promise: Promise
    ) {
        val cleanNumber = phoneNumber.trim()
        if (cleanNumber.isEmpty()) {
            promise.reject("E_SMS_NUMBER", "Emergency SMS number is missing.")
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject(
                "E_SMS_NO_ACTIVITY",
                "Opening the system SMS composer requires an active Android activity."
            )
            return
        }

        val smsIntent = Intent(Intent.ACTION_SENDTO).apply {
            data = Uri.parse("smsto:${Uri.encode(cleanNumber)}")
            putExtra("sms_body", message.ifBlank { "Emergency assistance requested." })
        }

        try {
            activity.startActivity(smsIntent)
            promise.resolve(Arguments.createMap().apply {
                putString("status", "pending")
                putString("reason", "Android opened the system SMS composer. User confirmation is required before the message is sent.")
            })
        } catch (error: Exception) {
            promise.reject(
                "E_SMS_COMPOSER",
                "Android could not open an SMS application for the emergency message.",
                error
            )
        }
    }

    /**
     * Lists active SIM/subscriptions so the app can offer a SIM picker on
     * dual-SIM devices. Single-SIM devices never need this — the caller
     * should skip any selection UI when only one entry is returned.
     */
    @ReactMethod
    fun getAvailableSims(promise: Promise) {
        try {
            val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
            val active = subscriptionManager?.activeSubscriptionInfoList ?: emptyList()
            val defaultSubscriptionId = try {
                SubscriptionManager.getDefaultVoiceSubscriptionId()
            } catch (e: Exception) {
                -1
            }

            val result = Arguments.createArray()
            active.forEach { info ->
                result.pushMap(Arguments.createMap().apply {
                    putInt("subscriptionId", info.subscriptionId)
                    putInt("slotIndex", info.simSlotIndex)
                    putString("displayName", info.displayName?.toString() ?: "SIM ${info.simSlotIndex + 1}")
                    putString("carrierName", info.carrierName?.toString() ?: "")
                    putBoolean("isDefault", info.subscriptionId == defaultSubscriptionId)
                })
            }
            promise.resolve(result)
        } catch (error: Exception) {
            // No visibility into SIMs shouldn't be fatal — callers treat an
            // empty/failed list the same as "let Android pick automatically".
            promise.resolve(Arguments.createArray())
        }
    }

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
            promise.reject(
                "E_CALL_PERMISSION",
                "CALL_PHONE permission is required to place the emergency call from the user device."
            )
            return
        }

        val activity = reactContext.currentActivity
        if (activity == null) {
            promise.reject(
                "E_CALL_NO_ACTIVITY",
                "Emergency calling requires an active Android activity."
            )
            return
        }

        val callIntent = Intent(Intent.ACTION_CALL, Uri.parse("tel:$cleanNumber"))
        Log.i("EmergencyMedia", "[SOS][CALL] ACTION_CALL intent created")
        val telecomManager = reactContext.getSystemService(TelecomManager::class.java)
        val resolution = resolvePhoneAccountHandle(telecomManager, preferredSubscriptionId)

        if (resolution.handle != null) {
            callIntent.putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", resolution.handle)
        }

        try {
            Log.i("EmergencyMedia", "[SOS][CALL] startActivity attempted")
            emitDiagnostic("CALL DEBUG — ACTION_CALL attempted")
            activity.startActivity(callIntent)
            Log.i("EmergencyMedia", "[SOS][CALL] ACTION_CALL requested")
            val reason = when {
                resolution.usedFallback ->
                    "Android launched the emergency call using a fallback telephony account because the saved emergency SIM is no longer active, but the final call status is not yet confirmed by the device."
                resolution.handle != null ->
                    "Android launched the emergency call intent using a device-exposed telephony account, but the final call status is not yet confirmed by the device."
                else ->
                    "Android launched the emergency call intent using the default device telephony path, but the final call status is not yet confirmed by the device."
            }
            promise.resolve(Arguments.createMap().apply {
                putString("status", "pending")
                putString("reason", reason)
                putBoolean("usedFallbackSim", resolution.usedFallback)
            })
        } catch (error: Exception) {
            Log.e("EmergencyMedia", "[SOS][CALL] ACTION_CALL failed", error)
            promise.reject(
                "E_CALL_LAUNCH",
                "Android could not launch the emergency call.",
                error
            )
        }
    }

    /** Downloads a protected SOS audio stream with the current JWT into the
     * app cache. react-native-sound cannot attach HTTP headers itself, so it
     * must never be handed the protected backend URL directly. */
    @ReactMethod
    fun downloadAuthenticatedMedia(
        mediaUrl: String,
        token: String,
        promise: Promise
    ) {
        if (mediaUrl.isBlank() || token.isBlank()) {
            promise.reject("E_MEDIA_AUTH", "A media URL and authentication token are required.")
            return
        }

        Thread {
            var connection: HttpURLConnection? = null
            try {
                connection = (URL(mediaUrl).openConnection() as HttpURLConnection).apply {
                    requestMethod = "GET"
                    connectTimeout = 15000
                    readTimeout = 30000
                    setRequestProperty("Authorization", "Bearer $token")
                }
                val status = connection.responseCode
                if (status !in 200..299) {
                    throw IllegalStateException("Media request was rejected (HTTP $status).")
                }

                val file = File(reactContext.cacheDir, "protected-sos-media/audio-${System.currentTimeMillis()}.m4a")
                file.parentFile?.mkdirs()
                connection.inputStream.use { input ->
                    FileOutputStream(file).use { output -> input.copyTo(output) }
                }
                promise.resolve(file.absolutePath)
            } catch (error: Exception) {
                promise.reject("E_MEDIA_DOWNLOAD", "Unable to download protected SOS media.", error)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }
    @ReactMethod
    fun recordAudio(
        sosId: String,
        durationMs: Int,
        promise: Promise
    ) {
        val file = File(
            reactContext.cacheDir,
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
                durationMs.coerceIn(1000, 10000).toLong()
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

    /**
     * Reports actual SIM/telephony readiness for SMS, independent of which
     * network interface (Wi-Fi or cellular) is currently carrying internet
     * traffic. A device on Wi-Fi with a working SIM must still be treated as
     * cellular-available; a data connection type is not a telephony signal.
     */
    @ReactMethod
    fun getTelephonyState(promise: Promise) {
        try {
            val telephonyManager = reactContext.getSystemService(android.telephony.TelephonyManager::class.java)
            val simState = telephonyManager?.simState ?: android.telephony.TelephonyManager.SIM_STATE_UNKNOWN
            val hasActiveSubscription = resolvePreferredSubscriptionId() >= 0

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
            // A failed check must never block emergency SMS. Default to
            // optimistic availability and let the actual SmsManager attempt
            // report the true outcome.
            promise.resolve(Arguments.createMap().apply {
                putString("status", "AVAILABLE")
                putString("reason", "Telephony state check failed; assuming available.")
                putBoolean("hasActiveSubscription", true)
            })
        }
    }

    private fun resolvePreferredSubscriptionId(): Int {
        return try {
            val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
            if (subscriptionManager == null) return -1

            val activeSubscriptions = subscriptionManager.activeSubscriptionInfoList
            if (activeSubscriptions == null || activeSubscriptions.isEmpty()) return -1

            // If only one SIM, use it
            if (activeSubscriptions.size == 1) {
                return activeSubscriptions[0].subscriptionId
            }

            // Multiple SIMs: prefer SIM slot 0, or first active
            val preferred = activeSubscriptions
                .filter { it.simSlotIndex >= 0 }
                .minByOrNull { it.simSlotIndex }
                ?: activeSubscriptions.firstOrNull()

            preferred?.subscriptionId ?: -1
        } catch (e: Exception) {
            -1
        }
    }

    private data class PhoneAccountResolution(val handle: PhoneAccountHandle?, val usedFallback: Boolean)

    /**
     * Resolves which telephony account to place the emergency call on.
     *
     * - preferredSubscriptionId >= 0 (a user-saved emergency SIM, or the
     *   single active SIM on a single-SIM device): use it if it's still
     *   active; otherwise fall back to the current default/first SIM rather
     *   than failing the call outright — a disappeared SIM must never
     *   silently block an emergency call.
     * - preferredSubscriptionId < 0 (no preference saved, e.g. dual-SIM with
     *   no configured choice yet): fall back to slot 0 / first active SIM,
     *   same as the previous automatic behavior.
     */
    private fun resolvePhoneAccountHandle(telecomManager: TelecomManager?, preferredSubscriptionId: Int): PhoneAccountResolution {
        if (telecomManager == null) return PhoneAccountResolution(null, false)

        val candidates = telecomManager.callCapablePhoneAccounts
        if (candidates.isEmpty()) return PhoneAccountResolution(null, false)

        val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
        val activeSubscriptions = subscriptionManager?.activeSubscriptionInfoList ?: emptyList()

        val requestedSubscription = if (preferredSubscriptionId >= 0) {
            activeSubscriptions.firstOrNull { it.subscriptionId == preferredSubscriptionId }
        } else {
            null
        }

        val usedFallback = preferredSubscriptionId >= 0 && requestedSubscription == null

        val resolvedSubscription = requestedSubscription
            ?: activeSubscriptions.firstOrNull { it.simSlotIndex == 0 }
            ?: activeSubscriptions.firstOrNull()

        if (resolvedSubscription == null) {
            return PhoneAccountResolution(candidates.firstOrNull(), usedFallback)
        }

        val handle = candidates.firstOrNull {
            it.id.contains(resolvedSubscription.subscriptionId.toString(), ignoreCase = true)
        } ?: candidates.firstOrNull()

        return PhoneAccountResolution(handle, usedFallback)
    }
}