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
    fun sendSms(
        phoneNumber: String,
        message: String,
        promise: Promise
    ) {
        val cleanNumber = phoneNumber.trim()
        if (cleanNumber.isEmpty()) {
            promise.reject("E_SMS_NUMBER", "Emergency SMS number is missing.")
            return
        }

        if (ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.SEND_SMS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            promise.reject(
                "E_SMS_PERMISSION",
                "SEND_SMS permission is required to send an emergency message from the user device."
            )
            return
        }

        try {
            val smsManager = resolveSmsManager()
            val requestCode = System.nanoTime().toInt() and Int.MAX_VALUE
            val sentAction = "com.coggsafe.SMS_SENT_$requestCode"
            val deliveredAction = "com.coggsafe.SMS_DELIVERED_$requestCode"

            val sentIntent = PendingIntent.getBroadcast(
                reactContext,
                requestCode,
                Intent(sentAction).setPackage(reactContext.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_IMMUTABLE
                } else {
                    0
                }
            )
            val deliveredIntent = PendingIntent.getBroadcast(
                reactContext,
                requestCode + 1,
                Intent(deliveredAction).setPackage(reactContext.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PendingIntent.FLAG_IMMUTABLE
                } else {
                    0
                }
            )

            val filter = IntentFilter(sentAction).apply {
                addAction(deliveredAction)
            }

            val receiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    val resultCode = resultCode
                    val status = when (resultCode) {
                        Activity.RESULT_OK -> "completed"
                        SmsManager.RESULT_ERROR_GENERIC_FAILURE,
                        SmsManager.RESULT_ERROR_NO_SERVICE,
                        SmsManager.RESULT_ERROR_NULL_PDU,
                        SmsManager.RESULT_ERROR_RADIO_OFF -> "failed"
                        else -> "pending"
                    }

                    val reason = when (resultCode) {
                        Activity.RESULT_OK -> "Android confirmed the SMS was sent."
                        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "Android reported a generic SMS send failure."
                        SmsManager.RESULT_ERROR_NO_SERVICE -> "Android reported that cellular service was unavailable for SMS."
                        SmsManager.RESULT_ERROR_NULL_PDU -> "Android reported a null SMS payload."
                        SmsManager.RESULT_ERROR_RADIO_OFF -> "Android reported that cellular radio was off."
                        else -> "Android SMS delivery is still pending confirmation."
                    }

                    try {
                        context.unregisterReceiver(this)
                    } catch (_: Exception) {
                        // Ignore receiver cleanup failure.
                    }

                    if (status == "completed") {
                        promise.resolve(Arguments.createMap().apply {
                            putString("status", status)
                            putString("reason", reason)
                        })
                    } else {
                        promise.reject("E_SMS_SEND", reason)
                    }
                }
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                reactContext.registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED)
            } else {
                reactContext.registerReceiver(receiver, filter)
            }

            smsManager.sendTextMessage(
                cleanNumber,
                null,
                message.ifBlank { "Emergency assistance requested." },
                sentIntent,
                deliveredIntent
            )
        } catch (error: SecurityException) {
            promise.reject(
                "E_SMS_PERMISSION",
                "Android blocked direct SMS sending. The app is not allowed to send SMS from this device or SIM configuration.",
                error
            )
        } catch (error: Exception) {
            promise.reject(
                "E_SMS_SEND",
                "Android could not send the emergency SMS.",
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
                "Android launched the emergency call using a device-exposed telephony account."
            } else {
                "Android launched the emergency call using the device default SIM because the OS did not expose a controllable SIM-1 selector."
            }
            promise.resolve(Arguments.createMap().apply {
                putString("status", "completed")
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

    private fun resolveSmsManager(): SmsManager {
        val subscriptionManager = reactContext.getSystemService(SubscriptionManager::class.java)
        val preferredSubscriptionId = subscriptionManager?.activeSubscriptionInfoList
            ?.firstOrNull { it.simSlotIndex == 0 }
            ?.subscriptionId
            ?: subscriptionManager?.activeSubscriptionInfoList
                ?.firstOrNull()
                ?.subscriptionId

        return if (preferredSubscriptionId != null) {
            try {
                SmsManager.getSmsManagerForSubscriptionId(preferredSubscriptionId)
            } catch (_: Exception) {
                SmsManager.getDefault()
            }
        } else {
            SmsManager.getDefault()
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