package com.coggsafe

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
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

    override fun getName(): String = "EmergencyMedia"

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
            promise.reject(
                "E_SMS_PERMISSION",
                "SEND_SMS permission is required to send the emergency message."
            )
            return
        }

        try {
            val subscriptionId = resolvePreferredSubscriptionId()
            val smsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: Use subscription-aware SmsManager
                if (subscriptionId > 0) {
                    android.telephony.SmsManager.getSmsManagerForSubscriptionId(subscriptionId)
                } else {
                    android.telephony.SmsManager.getDefault()
                }
            } else {
                android.telephony.SmsManager.getDefault()
            }

            // Prepare PendingIntent callbacks for SENT and DELIVERED
            val sentIntent = PendingIntent.getBroadcast(
                reactContext,
                (System.currentTimeMillis() % 10000).toInt(),
                Intent("SOS_SMS_SENT"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val deliveredIntent = PendingIntent.getBroadcast(
                reactContext,
                (System.currentTimeMillis() % 10000).toInt() + 1,
                Intent("SOS_SMS_DELIVERED"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // Send SMS with callbacks
            smsManager.sendTextMessage(
                cleanNumber,
                null,
                message.ifBlank { "Emergency assistance requested." },
                sentIntent,
                deliveredIntent
            )

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

    @ReactMethod
    fun placeCall(
        phoneNumber: String,
        promise: Promise
    ) {
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
        val telecomManager = reactContext.getSystemService(TelecomManager::class.java)
        val preferredHandle = resolvePreferredPhoneAccountHandle(telecomManager)

        if (preferredHandle != null) {
            callIntent.putExtra("android.telecom.extra.PHONE_ACCOUNT_HANDLE", preferredHandle)
        }

        try {
            activity.startActivity(callIntent)
            val reason = if (preferredHandle != null) {
                "Android launched the emergency call intent using a device-exposed telephony account, but the final call status is not yet confirmed by the device."
            } else {
                "Android launched the emergency call intent using the default device telephony path, but the final call status is not yet confirmed by the device."
            }
            promise.resolve(Arguments.createMap().apply {
                putString("status", "pending")
                putString("reason", reason)
            })
        } catch (error: Exception) {
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

    private fun resolvePreferredPhoneAccountHandle(telecomManager: TelecomManager?): PhoneAccountHandle? {
        if (telecomManager == null) return null

        val candidates = telecomManager.callCapablePhoneAccounts
        if (candidates.isEmpty()) return null

        val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
        val preferredSubscription = subscriptionManager?.activeSubscriptionInfoList
            ?.firstOrNull { it.simSlotIndex == 0 }
            ?: subscriptionManager?.activeSubscriptionInfoList?.firstOrNull()

        if (preferredSubscription == null) return candidates.firstOrNull()

        return candidates.firstOrNull {
            it.id.contains(preferredSubscription.subscriptionId.toString(), ignoreCase = true)
        } ?: candidates.firstOrNull()
    }
}