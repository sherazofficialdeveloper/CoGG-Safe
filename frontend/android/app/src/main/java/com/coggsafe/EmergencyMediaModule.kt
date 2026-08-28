package com.coggsafe

import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
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

        var recorder: MediaRecorder? = null

        try {
            recorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
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
}