package com.anonymous.combiscontrol.location

import android.content.Context
import android.content.Intent
import android.location.LocationManager
import android.os.Build
import com.facebook.react.bridge.Arguments
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
    refreshToken: String,
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
        putExtra(ManeCombLocationService.EXTRA_REFRESH_TOKEN, refreshToken)
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
  fun hasServicesEnabled(promise: Promise) {
    try {
      val manager = reactContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
      val enabled = manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
      promise.resolve(enabled)
    } catch (error: Exception) {
      promise.reject("location_services_status_failed", error.message, error)
    }
  }

  @ReactMethod
  fun getServiceStatus(promise: Promise) {
    val prefs = reactContext.getSharedPreferences(
      ManeCombLocationService.PREFS_NAME,
      Context.MODE_PRIVATE
    )
    val reason = prefs.getString(ManeCombLocationService.KEY_STATUS_REASON, null)
    val sessionId = prefs.getString(ManeCombLocationService.KEY_SESSION_ID, null)

    promise.resolve(Arguments.createMap().apply {
      putBoolean("active", prefs.getBoolean(ManeCombLocationService.KEY_SERVICE_ENABLED, false))
      putString("reason", reason)
      putString("vehicleId", prefs.getString(ManeCombLocationService.KEY_VEHICLE_ID, null))
      putBoolean("sessionIdPresent", !sessionId.isNullOrBlank())
      putBoolean("trackingActive", prefs.getBoolean(ManeCombLocationService.KEY_TRACKING_ACTIVE, false))
      putInt("pendingPackets", prefs.getInt(ManeCombLocationService.KEY_PENDING_COUNT, 0))
      putInt("droppedPackets", prefs.getInt(ManeCombLocationService.KEY_DROPPED_COUNT, 0))
      putNullableTimestamp(this, "lastCapturedAt", prefs.getLong(ManeCombLocationService.KEY_LAST_CAPTURED_AT, 0L))
      putNullableTimestamp(this, "lastSentAt", prefs.getLong(ManeCombLocationService.KEY_LAST_SENT_AT, 0L))
      putNullableTimestamp(this, "lastConfirmedAt", prefs.getLong(ManeCombLocationService.KEY_LAST_CONFIRMED_AT, 0L))
    })

    if (reason != null) {
      prefs.edit().remove(ManeCombLocationService.KEY_STATUS_REASON).apply()
    }
  }

  private fun putNullableTimestamp(
    map: com.facebook.react.bridge.WritableMap,
    key: String,
    value: Long
  ) {
    if (value > 0L) map.putDouble(key, value.toDouble()) else map.putNull(key)
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

  @ReactMethod
  fun hardStopService(promise: Promise) {
    try {
      ManeCombLocationService.hardResetPersistedState(reactContext)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("location_service_hard_stop_failed", error.message, error)
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
