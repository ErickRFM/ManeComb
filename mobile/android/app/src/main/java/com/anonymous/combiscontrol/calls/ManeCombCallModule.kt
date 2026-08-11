package com.anonymous.combiscontrol.calls

import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import com.anonymous.combiscontrol.MainActivity
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ManeCombCallModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "ManeCombCall"

  @ReactMethod
  fun startCallForegroundService(isVideo: Boolean, promise: Promise) {
    try {
      val intent = Intent(reactContext, ManeCombCallService::class.java)
        .putExtra(ManeCombCallService.EXTRA_IS_VIDEO, isVideo)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("call_service_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopCallForegroundService(promise: Promise) {
    try {
      reactContext.stopService(Intent(reactContext, ManeCombCallService::class.java))
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("call_service_stop_failed", error.message, error)
    }
  }

  @ReactMethod
  fun setIncomingCallWindowActive(active: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity as? MainActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }

    activity.runOnUiThread {
      try {
        activity.setIncomingCallWindowActive(active)
        promise.resolve(true)
      } catch (_: Exception) {
        promise.resolve(false)
      }
    }
  }

  @ReactMethod
  fun setCallSpeakerEnabled(enabled: Boolean, promise: Promise) {
    try {
      val manager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      if (manager == null) {
        promise.resolve(false)
        return
      }

      manager.mode = AudioManager.MODE_IN_COMMUNICATION
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        if (enabled) {
          val speaker = manager.availableCommunicationDevices.firstOrNull {
            it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
          }
          promise.resolve(speaker != null && manager.setCommunicationDevice(speaker))
        } else {
          manager.clearCommunicationDevice()
          promise.resolve(true)
        }
      } else {
        @Suppress("DEPRECATION")
        manager.isSpeakerphoneOn = enabled
        promise.resolve(true)
      }
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }

  @ReactMethod
  fun resetCallAudioRoute(promise: Promise) {
    try {
      val manager = reactContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
      if (manager == null) {
        promise.resolve(false)
        return
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        manager.clearCommunicationDevice()
      } else {
        @Suppress("DEPRECATION")
        run { manager.isSpeakerphoneOn = false }
      }
      promise.resolve(true)
    } catch (_: Exception) {
      promise.resolve(false)
    }
  }
}
