package com.anonymous.combiscontrol.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class ManeCombLocationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ManeCombLocation"

  @ReactMethod
  fun startService(
    apiUrl: String,
    token: String,
    vehicleId: String,
    sessionId: String,
    scheduleEnabled: Boolean,
    scheduleStart: String,
    scheduleEnd: String,
    activeDays: ReadableArray,
    promise: Promise
  ) {
    try {
      val intent = Intent(reactContext, ManeCombLocationService::class.java).apply {
        putExtra(ManeCombLocationService.EXTRA_API_URL, apiUrl)
        putExtra(ManeCombLocationService.EXTRA_TOKEN, token)
        putExtra(ManeCombLocationService.EXTRA_VEHICLE_ID, vehicleId)
        putExtra(ManeCombLocationService.EXTRA_SESSION_ID, sessionId)
        putExtra(ManeCombLocationService.EXTRA_SCHEDULE_ENABLED, scheduleEnabled)
        putExtra(ManeCombLocationService.EXTRA_SCHEDULE_START, scheduleStart)
        putExtra(ManeCombLocationService.EXTRA_SCHEDULE_END, scheduleEnd)
        putExtra(ManeCombLocationService.EXTRA_ACTIVE_DAYS, readableArrayToJson(activeDays))
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("location_service_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopService(promise: Promise) {
    try {
      val intent = Intent(reactContext, ManeCombLocationService::class.java).apply {
        action = ManeCombLocationService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("location_service_stop_failed", error.message, error)
    }
  }

  private fun readableArrayToJson(value: ReadableArray): String {
    val entries = mutableListOf<String>()
    for (index in 0 until value.size()) {
      entries.add(value.getInt(index).toString())
    }
    return "[${entries.joinToString(",")}]"
  }
}
