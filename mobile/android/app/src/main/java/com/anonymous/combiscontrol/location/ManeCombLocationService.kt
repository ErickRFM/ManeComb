package com.anonymous.combiscontrol.location

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar
import org.json.JSONArray
import org.json.JSONObject

class ManeCombLocationService : Service(), LocationListener {
  private var apiUrl: String = ""
  private var token: String = ""
  private var vehicleId: String = ""
  private var scheduleEnabled: Boolean = true
  private var scheduleStartTime: String = ""
  private var scheduleEndTime: String = ""
  private var activeDays: Set<Int> = emptySet()
  private var locationManager: LocationManager? = null
  private var lastSentAt: Long = 0L

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    ensureNotificationChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      stopTracking()
      stopSelf()
      return START_NOT_STICKY
    }

    apiUrl = intent?.getStringExtra(EXTRA_API_URL).orEmpty().trimEnd('/')
    token = intent?.getStringExtra(EXTRA_TOKEN).orEmpty()
    vehicleId = intent?.getStringExtra(EXTRA_VEHICLE_ID).orEmpty()
    scheduleEnabled = intent?.getBooleanExtra(EXTRA_SCHEDULE_ENABLED, true) ?: true
    scheduleStartTime = intent?.getStringExtra(EXTRA_SCHEDULE_START).orEmpty()
    scheduleEndTime = intent?.getStringExtra(EXTRA_SCHEDULE_END).orEmpty()
    activeDays = parseActiveDays(intent?.getStringExtra(EXTRA_ACTIVE_DAYS).orEmpty())

    startForeground(NOTIFICATION_ID, buildNotification())
    startTracking()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    stopTracking()
    super.onDestroy()
  }

  override fun onLocationChanged(location: Location) {
    val now = System.currentTimeMillis()
    if (now - lastSentAt < 5000L || !isWithinSchedule()) {
      return
    }

    lastSentAt = now
    sendLocation(location)
  }

  @Deprecated("Deprecated in Android SDK")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

  override fun onProviderEnabled(provider: String) = Unit

  override fun onProviderDisabled(provider: String) = Unit

  private fun startTracking() {
    if (apiUrl.isBlank() || token.isBlank() || vehicleId.isBlank() || !hasLocationPermission()) {
      return
    }

    val manager = locationManager ?: return
    try {
      manager.removeUpdates(this)
      manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 5000L, 0f, this)
      manager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000L, 0f, this)
    } catch (_: SecurityException) {
      stopSelf()
    } catch (_: IllegalArgumentException) {
      // Provider can be missing on some devices.
    }
  }

  private fun stopTracking() {
    try {
      locationManager?.removeUpdates(this)
    } catch (_: SecurityException) {
      // Ignore permission changes while stopping.
    }
  }

  private fun sendLocation(location: Location) {
    val safeApiUrl = apiUrl
    val safeToken = token
    val safeVehicleId = vehicleId

    Thread {
      try {
        val body = JSONObject()
          .put("vehicleId", safeVehicleId)
          .put(
            "coordinates",
            JSONObject()
              .put("latitude", location.latitude)
              .put("longitude", location.longitude)
              .put("accuracy", if (location.hasAccuracy()) location.accuracy else JSONObject.NULL)
              .put("heading", if (location.hasBearing()) location.bearing else JSONObject.NULL)
              .put("speed", if (location.hasSpeed()) location.speed else JSONObject.NULL)
          )
          .put("speed", if (location.hasSpeed()) location.speed else JSONObject.NULL)

        val connection = URL("$safeApiUrl/locations/update").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        connection.doOutput = true
        connection.setRequestProperty("Authorization", "Bearer $safeToken")
        connection.setRequestProperty("Content-Type", "application/json")
        OutputStreamWriter(connection.outputStream).use { writer ->
          writer.write(body.toString())
        }
        connection.inputStream.close()
        connection.disconnect()
      } catch (_: Exception) {
        // Network retry is handled by the JS foreground path when the app is active.
      }
    }.start()
  }

  private fun hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  private fun isWithinSchedule(): Boolean {
    if (scheduleStartTime.isBlank() || scheduleEndTime.isBlank()) {
      return true
    }

    if (!scheduleEnabled) {
      return false
    }

    val calendar = Calendar.getInstance()
    if (activeDays.isNotEmpty() && !activeDays.contains(calendar.get(Calendar.DAY_OF_WEEK) - 1)) {
      return false
    }

    val start = minutesFromTime(scheduleStartTime) ?: return false
    val end = minutesFromTime(scheduleEndTime) ?: return false
    val current = calendar.get(Calendar.HOUR_OF_DAY) * 60 + calendar.get(Calendar.MINUTE)
    return if (start == end) {
      true
    } else if (start < end) {
      current in start..end
    } else {
      current >= start || current <= end
    }
  }

  private fun minutesFromTime(value: String): Int? {
    val parts = value.split(":")
    if (parts.size != 2) return null
    val hours = parts[0].toIntOrNull() ?: return null
    val minutes = parts[1].toIntOrNull() ?: return null
    if (hours !in 0..23 || minutes !in 0..59) return null
    return hours * 60 + minutes
  }

  private fun parseActiveDays(value: String): Set<Int> {
    if (value.isBlank()) return emptySet()
    return try {
      val json = JSONArray(value)
      val days = mutableSetOf<Int>()
      for (index in 0 until json.length()) {
        val day = json.optInt(index, -1)
        if (day in 0..6) days.add(day)
      }
      days
    } catch (_: Exception) {
      emptySet()
    }
  }

  private fun ensureNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Operacion ManeComb",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.description = "GPS operativo en segundo plano"
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification() =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("ManeComb compartiendo ubicacion")
      .setContentText("GPS operativo activo dentro de horario.")
      .setSmallIcon(R.drawable.notification_icon)
      .setOngoing(true)
      .setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          Intent(this, MainActivity::class.java),
          PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
      )
      .build()

  companion object {
    const val ACTION_STOP = "com.anonymous.combiscontrol.location.STOP"
    const val EXTRA_API_URL = "apiUrl"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_VEHICLE_ID = "vehicleId"
    const val EXTRA_SCHEDULE_ENABLED = "scheduleEnabled"
    const val EXTRA_SCHEDULE_START = "scheduleStart"
    const val EXTRA_SCHEDULE_END = "scheduleEnd"
    const val EXTRA_ACTIVE_DAYS = "activeDays"
    private const val CHANNEL_ID = "manecomb-location"
    private const val NOTIFICATION_ID = 4107
  }
}
