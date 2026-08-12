package com.anonymous.combiscontrol.location

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.ArrayDeque
import java.util.Calendar
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

class ManeCombLocationService : Service(), LocationListener {
  private var apiUrl: String = ""
  private var token: String = ""
  private var refreshToken: String = ""
  private var vehicleId: String = ""
  private var sessionId: String = ""
  private var scheduleEnabled: Boolean = true
  private var scheduleStartTime: String = ""
  private var scheduleEndTime: String = ""
  private var activeDays: Set<Int> = emptySet()
  private var locationManager: LocationManager? = null
  private var connectivityManager: ConnectivityManager? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null
  private var lastEnqueuedElapsedRealtimeMs: Long = 0L
  private val pendingLocations = ArrayDeque<JSONObject>()
  private val queueLock = Object()
  private val scheduleHandler = Handler(Looper.getMainLooper())
  private var flushInProgress = false
  private var retryScheduled = false
  private var retryDelayMs = RETRY_BASE_MS
  private var stopAfterFlush = false
  private var trackingActive = false
  @Volatile private var hardStopped = false

  private val scheduleMonitor = object : Runnable {
    override fun run() {
      updateTrackingForSchedule()
      scheduleHandler.postDelayed(this, SCHEDULE_RECHECK_MS)
    }
  }

  override fun onCreate() {
    super.onCreate()
    locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
    connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    ensureNotificationChannel()
    activeService = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      scheduleHandler.removeCallbacks(scheduleMonitor)
      stopTracking()
      stopAfterFlush = true
      prefs().edit().putBoolean(KEY_SERVICE_ENABLED, false).apply()
      val hasPending = synchronized(queueLock) { pendingLocations.isNotEmpty() }
      if (hasPending) {
        flushPendingLocations()
      } else {
        clearServiceConfig()
        stopSelf()
      }
      return START_NOT_STICKY
    }

    hardStopped = false
    val startIntent = intent ?: buildIntentFromPrefs(this)
    stopAfterFlush = false
    apiUrl = startIntent?.getStringExtra(EXTRA_API_URL).orEmpty().trimEnd('/')
    token = startIntent?.getStringExtra(EXTRA_TOKEN).orEmpty()
    refreshToken = startIntent?.getStringExtra(EXTRA_REFRESH_TOKEN).orEmpty()
    vehicleId = startIntent?.getStringExtra(EXTRA_VEHICLE_ID).orEmpty()
    sessionId = startIntent?.getStringExtra(EXTRA_SESSION_ID).orEmpty()
    scheduleEnabled = startIntent?.getBooleanExtra(EXTRA_SCHEDULE_ENABLED, true) ?: true
    scheduleStartTime = startIntent?.getStringExtra(EXTRA_SCHEDULE_START).orEmpty()
    scheduleEndTime = startIntent?.getStringExtra(EXTRA_SCHEDULE_END).orEmpty()
    activeDays = parseActiveDays(startIntent?.getStringExtra(EXTRA_ACTIVE_DAYS).orEmpty())

    if (apiUrl.isBlank() || token.isBlank() || vehicleId.isBlank()) {
      Log.w(TAG, "Cannot start background GPS without apiUrl, token and vehicleId.")
      clearServiceConfig()
      stopSelf()
      return START_NOT_STICKY
    }

    startIntent?.let { persistServiceConfig(it) }
    setServiceStatus(true, null)
    loadPendingLocations()
    startForeground(NOTIFICATION_ID, buildNotification())
    registerNetworkCallback()
    startScheduleMonitor()
    flushPendingLocations()
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    scheduleHandler.removeCallbacks(scheduleMonitor)
    stopTracking()
    unregisterNetworkCallback()
    if (activeService === this) activeService = null
    super.onDestroy()
  }

  override fun onLocationChanged(location: Location) {
    if (hardStopped) return
    val nowElapsedRealtimeMs = SystemClock.elapsedRealtime()
    val accuracyMeters = if (location.hasAccuracy()) location.accuracy else null
    if (!ManeCombLocationCadence.shouldEnqueue(
        nowElapsedRealtimeMs,
        lastEnqueuedElapsedRealtimeMs,
        accuracyMeters
      )) {
      return
    }

    if (!isWithinSchedule()) {
      updateTrackingForSchedule()
      return
    }

    lastEnqueuedElapsedRealtimeMs = nowElapsedRealtimeMs
    enqueueLocation(location)
  }

  @Deprecated("Deprecated in Android SDK")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

  override fun onProviderEnabled(provider: String) {
    updateTrackingForSchedule()
  }

  override fun onProviderDisabled(provider: String) {
    updateTrackingForSchedule()
  }

  private fun startScheduleMonitor() {
    scheduleHandler.removeCallbacks(scheduleMonitor)
    scheduleHandler.post(scheduleMonitor)
  }

  private fun updateTrackingForSchedule() {
    if (!isWithinSchedule()) {
      stopTracking()
      setServiceStatus(true, "outside_schedule")
      return
    }

    if (!hasLocationPermission()) {
      stopTracking()
      setServiceStatus(true, "permission_denied")
      return
    }

    if (!hasEnabledLocationProvider()) {
      stopTracking()
      setServiceStatus(true, "services_disabled")
      return
    }

    setServiceStatus(true, null)
    startTracking()
  }

  private fun startTracking() {
    if (trackingActive || apiUrl.isBlank() || token.isBlank() || vehicleId.isBlank() || !hasLocationPermission()) {
      return
    }

    val manager = locationManager ?: return
    var registeredProvider = false

    try {
      manager.removeUpdates(this)

      if (manager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
        manager.requestLocationUpdates(
          LocationManager.GPS_PROVIDER,
          ManeCombLocationCadence.REQUEST_INTERVAL_MS,
          0f,
          this
        )
        registeredProvider = true
      }

      if (manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
        manager.requestLocationUpdates(
          LocationManager.NETWORK_PROVIDER,
          ManeCombLocationCadence.REQUEST_INTERVAL_MS,
          0f,
          this
        )
        registeredProvider = true
      }

      trackingActive = registeredProvider
      prefs().edit().putBoolean(KEY_TRACKING_ACTIVE, trackingActive).apply()
    } catch (error: SecurityException) {
      trackingActive = false
      prefs().edit().putBoolean(KEY_TRACKING_ACTIVE, false).apply()
      Log.w(TAG, "Location permission changed while starting service.", error)
      setServiceStatus(true, "permission_denied")
    } catch (error: IllegalArgumentException) {
      trackingActive = false
      prefs().edit().putBoolean(KEY_TRACKING_ACTIVE, false).apply()
      Log.w(TAG, "Location provider unavailable on this device.", error)
      setServiceStatus(true, "services_disabled")
    }
  }

  private fun stopTracking() {
    try {
      locationManager?.removeUpdates(this)
    } catch (error: SecurityException) {
      Log.w(TAG, "Location permission changed while stopping service.", error)
    } finally {
      trackingActive = false
      prefs().edit().putBoolean(KEY_TRACKING_ACTIVE, false).apply()
    }
  }

  private fun enqueueLocation(location: Location) {
    val safeApiUrl = apiUrl
    val safeToken = token
    val safeVehicleId = vehicleId

    if (safeApiUrl.isBlank() || safeToken.isBlank() || safeVehicleId.isBlank()) {
      return
    }

    val capturedAt = System.currentTimeMillis()
    val body = JSONObject()
      .put("vehicleId", safeVehicleId)
      .put("sessionId", sessionId)
      .put("packetId", UUID.randomUUID().toString())
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
      .put("timestamp", capturedAt)

    synchronized(queueLock) {
      trimPendingLocationsLocked(capturedAt)
      pendingLocations.addLast(body)
      trimPendingLocationsLocked(capturedAt)
      prefs().edit().putLong(KEY_LAST_CAPTURED_AT, capturedAt).apply()
      savePendingLocationsLocked()
    }

    flushPendingLocations()
  }

  private fun flushPendingLocations() {
    if (hardStopped) return
    synchronized(queueLock) {
      if (flushInProgress) {
        return
      }
      flushInProgress = true
    }

    Thread {
      try {
        val hasPendingLocations = synchronized(queueLock) { pendingLocations.isNotEmpty() }
        val needsServerSession = sessionId.startsWith("pending:")
        if (hasPendingLocations && needsServerSession && !ensureRouteSessionStarted()) {
          scheduleRetry()
          return@Thread
        }

        while (true) {
          val next = synchronized(queueLock) { pendingLocations.peekFirst() } ?: break

          if (!postLocation(next)) {
            scheduleRetry()
            break
          }

          synchronized(queueLock) {
            pendingLocations.removeFirst()
            savePendingLocationsLocked()
          }
          retryDelayMs = RETRY_BASE_MS
        }
      } finally {
        synchronized(queueLock) {
          flushInProgress = false
        }
        if (stopAfterFlush && synchronized(queueLock) { pendingLocations.isEmpty() }) {
          clearServiceConfig()
          stopSelf()
        }
      }
    }.start()
  }

  /**
   * `pending:*` is an explicit offline-session marker. A blank session means live tracking only
   * and must never create a RouteSession implicitly.
   */
  private fun ensureRouteSessionStarted(authRetry: Boolean = true): Boolean {
    val safeApiUrl = apiUrl
    val safeToken = token
    var connection: HttpURLConnection? = null
    val wakeLock = acquireUploadWakeLock()

    return try {
      connection = URL("$safeApiUrl/navigation/sessions/start").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.readTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $safeToken")
      connection.setRequestProperty("Content-Type", "application/json")
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(JSONObject().put("vehicleId", vehicleId).toString())
      }

      val responseCode = connection.responseCode
      closeConnectionBody(connection)
      when {
        responseCode in 200..299 -> true
        responseCode == HttpURLConnection.HTTP_UNAUTHORIZED ||
          responseCode == HttpURLConnection.HTTP_FORBIDDEN -> {
          if (authRetry && refreshAccessToken()) ensureRouteSessionStarted(false) else stopForAuthFailure(responseCode)
        }
        else -> {
          Log.w(TAG, "Could not ensure pending route session HTTP $responseCode; GPS queue retained.")
          false
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not ensure pending route session; GPS queue retained.", error)
      false
    } finally {
      connection?.disconnect()
      releaseUploadWakeLock(wakeLock)
    }
  }

  private fun postLocation(body: JSONObject, authRetry: Boolean = true): Boolean {
    if (hardStopped) return false
    val safeApiUrl = apiUrl
    val safeToken = token
    var connection: HttpURLConnection? = null
    val wakeLock = acquireUploadWakeLock()

    return try {
      connection = URL("$safeApiUrl/locations/update").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.readTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer $safeToken")
      connection.setRequestProperty("Content-Type", "application/json")

      // The persisted body owns capture time. Queue age is derived immediately
      // before every attempt so retries report elapsed transport delay without
      // mutating the durable queue or trusting the server/device wall-clock offset.
      val uploadBody = JSONObject(body.toString())
      val capturedAt = uploadBody.optLong("timestamp", 0L)
      if (capturedAt > 0L) {
        val queueAgeMs = (System.currentTimeMillis() - capturedAt)
          .coerceAtLeast(0L)
          .coerceAtMost(MAX_PENDING_AGE_MS)
        uploadBody.put("clientQueueAgeMs", queueAgeMs)
      }
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(uploadBody.toString())
      }

      val responseCode = connection.responseCode
      closeConnectionBody(connection)

      when {
        responseCode in 200..299 -> {
          val confirmedAt = System.currentTimeMillis()
          prefs().edit()
            .putLong(KEY_LAST_SENT_AT, confirmedAt)
            .putLong(KEY_LAST_CONFIRMED_AT, confirmedAt)
            .apply()
          true
        }
        responseCode == HttpURLConnection.HTTP_UNAUTHORIZED ||
          responseCode == HttpURLConnection.HTTP_FORBIDDEN -> {
          if (authRetry && refreshAccessToken()) postLocation(body, false) else stopForAuthFailure(responseCode)
        }
        else -> {
          Log.w(TAG, "Background GPS upload failed HTTP $responseCode; queued for retry.")
          false
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Background GPS upload failed; queued for retry.", error)
      false
    } finally {
      connection?.disconnect()
      releaseUploadWakeLock(wakeLock)
    }
  }

  private fun refreshAccessToken(): Boolean {
    if (hardStopped) return false
    val safeRefreshToken = refreshToken
    if (safeRefreshToken.isBlank()) return false
    var connection: HttpURLConnection? = null
    return try {
      connection = URL("$apiUrl/auth/refresh").openConnection() as HttpURLConnection
      connection.requestMethod = "POST"
      connection.connectTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.readTimeout = HTTP_TIMEOUT_MS.toInt()
      connection.doOutput = true
      connection.setRequestProperty("Content-Type", "application/json")
      OutputStreamWriter(connection.outputStream).use { writer ->
        writer.write(JSONObject().put("refreshToken", safeRefreshToken).toString())
      }
      if (connection.responseCode !in 200..299) {
        closeConnectionBody(connection)
        false
      } else {
        val response = connection.inputStream.bufferedReader().use { it.readText() }
        val payload = JSONObject(response)
        val nextToken = payload.optString("token")
        val nextRefreshToken = payload.optString("refreshToken", safeRefreshToken)
        if (nextToken.isBlank()) false else {
          token = nextToken
          refreshToken = nextRefreshToken
          ManeCombLocationCredentials.write(prefs(), token, refreshToken)
          true
        }
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not refresh background GPS credentials.", error)
      false
    } finally {
      connection?.disconnect()
    }
  }

  private fun hardStopImmediately() {
    hardStopped = true
    scheduleHandler.removeCallbacks(scheduleMonitor)
    stopTracking()
    unregisterNetworkCallback()
    synchronized(queueLock) {
      pendingLocations.clear()
      retryScheduled = false
    }
    apiUrl = ""
    token = ""
    refreshToken = ""
    vehicleId = ""
    sessionId = ""
    stopAfterFlush = false
    stopSelf()
  }

  private fun stopForAuthFailure(responseCode: Int): Boolean {
    Log.w(TAG, "Stopping background GPS after auth failure HTTP $responseCode.")
    setServiceStatus(false, "auth_failed")
    scheduleHandler.removeCallbacks(scheduleMonitor)
    stopTracking()
    stopSelf()
    return false
  }

  private fun setServiceStatus(active: Boolean, reason: String?) {
    prefs().edit().putBoolean(KEY_SERVICE_ENABLED, active).putString(KEY_STATUS_REASON, reason).apply()
  }

  private fun acquireUploadWakeLock(): PowerManager.WakeLock? =
    try {
      val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG).apply {
        setReferenceCounted(false)
        acquire(WAKE_LOCK_TIMEOUT_MS)
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not acquire upload wake lock.", error)
      null
    }

  private fun releaseUploadWakeLock(wakeLock: PowerManager.WakeLock?) {
    try {
      if (wakeLock?.isHeld == true) {
        wakeLock.release()
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not release upload wake lock.", error)
    }
  }

  private fun closeConnectionBody(connection: HttpURLConnection) {
    try {
      connection.inputStream?.close()
    } catch (_: Exception) {
      try {
        connection.errorStream?.close()
      } catch (_: Exception) {
        // Nothing else to close.
      }
    }
  }

  private fun scheduleRetry() {
    if (hardStopped) return
    synchronized(queueLock) {
      if (retryScheduled || pendingLocations.isEmpty()) {
        return
      }
      retryScheduled = true
    }

    val delay = retryDelayMs
    retryDelayMs = (retryDelayMs * 2).coerceAtMost(RETRY_MAX_MS)

    Thread {
      try {
        Thread.sleep(delay)
      } catch (error: InterruptedException) {
        Thread.currentThread().interrupt()
        Log.w(TAG, "Background GPS retry interrupted.", error)
      }

      synchronized(queueLock) {
        retryScheduled = false
      }
      flushPendingLocations()
    }.start()
  }

  private fun registerNetworkCallback() {
    if (networkCallback != null) {
      return
    }

    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        Log.i(TAG, "Network available; flushing pending GPS queue.")
        flushPendingLocations()
      }

      override fun onLost(network: Network) {
        Log.w(TAG, "Network lost while background GPS is active.")
      }
    }

    try {
      val manager = connectivityManager ?: return
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        manager.registerDefaultNetworkCallback(callback)
      } else {
        val request = NetworkRequest.Builder()
          .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
          .build()
        manager.registerNetworkCallback(request, callback)
      }
      networkCallback = callback
    } catch (error: Exception) {
      Log.w(TAG, "Could not register network callback.", error)
    }
  }

  private fun unregisterNetworkCallback() {
    val callback = networkCallback ?: return
    try {
      connectivityManager?.unregisterNetworkCallback(callback)
    } catch (error: Exception) {
      Log.w(TAG, "Could not unregister network callback.", error)
    } finally {
      networkCallback = null
    }
  }

  private fun hasLocationPermission(): Boolean {
    val fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
    val coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
    return fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED
  }

  private fun hasEnabledLocationProvider(): Boolean {
    val manager = locationManager ?: return false
    return try {
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    } catch (error: Exception) {
      Log.w(TAG, "Could not read location provider state.", error)
      false
    }
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

  private fun prefs(): SharedPreferences =
    getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  private fun persistServiceConfig(intent: Intent) {
    val preferences = prefs()
    ManeCombLocationCredentials.write(
      preferences,
      intent.getStringExtra(EXTRA_TOKEN).orEmpty(),
      intent.getStringExtra(EXTRA_REFRESH_TOKEN).orEmpty()
    )
    preferences
      .edit()
      .putBoolean(KEY_SERVICE_ENABLED, true)
      .putString(KEY_API_URL, intent.getStringExtra(EXTRA_API_URL).orEmpty())
      .putString(KEY_VEHICLE_ID, intent.getStringExtra(EXTRA_VEHICLE_ID).orEmpty())
      .putString(KEY_SESSION_ID, intent.getStringExtra(EXTRA_SESSION_ID).orEmpty())
      .putBoolean(KEY_SCHEDULE_ENABLED, intent.getBooleanExtra(EXTRA_SCHEDULE_ENABLED, true))
      .putString(KEY_SCHEDULE_START, intent.getStringExtra(EXTRA_SCHEDULE_START).orEmpty())
      .putString(KEY_SCHEDULE_END, intent.getStringExtra(EXTRA_SCHEDULE_END).orEmpty())
      .putString(KEY_ACTIVE_DAYS, intent.getStringExtra(EXTRA_ACTIVE_DAYS).orEmpty())
      .apply()
  }

  private fun clearServiceConfig() {
    val preferences = prefs()
    ManeCombLocationCredentials.clear(preferences)
    preferences
      .edit()
      .putBoolean(KEY_SERVICE_ENABLED, false)
      .putBoolean(KEY_TRACKING_ACTIVE, false)
      .remove(KEY_API_URL)
      .remove(KEY_VEHICLE_ID)
      .remove(KEY_SESSION_ID)
      .remove(KEY_SCHEDULE_ENABLED)
      .remove(KEY_SCHEDULE_START)
      .remove(KEY_SCHEDULE_END)
      .remove(KEY_ACTIVE_DAYS)
      .remove(KEY_PENDING_LOCATIONS)
      .remove(KEY_PENDING_OWNER_VEHICLE_ID)
      .putInt(KEY_PENDING_COUNT, 0)
      .apply()
  }

  private fun loadPendingLocations() {
    val queueOwnerVehicleId = prefs().getString(KEY_PENDING_OWNER_VEHICLE_ID, "").orEmpty()
    if (queueOwnerVehicleId.isNotBlank() && queueOwnerVehicleId != vehicleId) {
      synchronized(queueLock) { pendingLocations.clear() }
      prefs().edit()
        .remove(KEY_PENDING_LOCATIONS)
        .remove(KEY_PENDING_OWNER_VEHICLE_ID)
        .putInt(KEY_PENDING_COUNT, 0)
        .apply()
      Log.w(TAG, "Discarded GPS queue from a different vehicle owner.")
      return
    }

    val rawQueue = prefs().getString(KEY_PENDING_LOCATIONS, "").orEmpty()
    if (rawQueue.isBlank()) {
      prefs().edit().putInt(KEY_PENDING_COUNT, 0).apply()
      return
    }

    try {
      val entries = JSONArray(rawQueue)
      synchronized(queueLock) {
        pendingLocations.clear()
        for (index in 0 until entries.length()) {
          val entry = entries.optJSONObject(index) ?: continue
          pendingLocations.addLast(entry)
        }
        trimPendingLocationsLocked(System.currentTimeMillis())
        savePendingLocationsLocked()
      }
    } catch (error: Exception) {
      Log.w(TAG, "Could not restore pending GPS queue.", error)
      synchronized(queueLock) {
        pendingLocations.clear()
      }
      prefs().edit().remove(KEY_PENDING_LOCATIONS).putInt(KEY_PENDING_COUNT, 0).apply()
    }
  }

  private fun trimPendingLocationsLocked(now: Long) {
    var dropped = 0

    while (pendingLocations.isNotEmpty()) {
      val capturedAt = pendingLocations.peekFirst()?.optLong("timestamp", 0L) ?: 0L
      if (capturedAt <= 0L || now - capturedAt <= MAX_PENDING_AGE_MS) {
        break
      }
      pendingLocations.removeFirst()
      dropped += 1
    }

    while (pendingLocations.size > MAX_PENDING_LOCATIONS) {
      pendingLocations.removeFirst()
      dropped += 1
    }

    if (dropped > 0) {
      val totalDropped = prefs().getInt(KEY_DROPPED_COUNT, 0) + dropped
      prefs().edit().putInt(KEY_DROPPED_COUNT, totalDropped).apply()
      Log.w(TAG, "Compacted background GPS queue; dropped=$dropped totalDropped=$totalDropped")
    }
  }

  private fun savePendingLocationsLocked() {
    val entries = JSONArray()
    pendingLocations.forEach { entries.put(it) }
    val editor = prefs().edit()
      .putString(KEY_PENDING_LOCATIONS, entries.toString())
      .putInt(KEY_PENDING_COUNT, pendingLocations.size)
    if (pendingLocations.isEmpty()) {
      editor.remove(KEY_PENDING_OWNER_VEHICLE_ID)
    } else {
      editor.putString(KEY_PENDING_OWNER_VEHICLE_ID, vehicleId)
    }
    editor.apply()
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
      .setContentText("GPS operativo preparado segun horario y permisos.")
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
    const val ACTION_RESTORE = "com.anonymous.combiscontrol.location.RESTORE"
    const val EXTRA_API_URL = "apiUrl"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_REFRESH_TOKEN = "refreshToken"
    const val EXTRA_VEHICLE_ID = "vehicleId"
    const val EXTRA_SESSION_ID = "sessionId"
    const val EXTRA_SCHEDULE_ENABLED = "scheduleEnabled"
    const val EXTRA_SCHEDULE_START = "scheduleStart"
    const val EXTRA_SCHEDULE_END = "scheduleEnd"
    const val EXTRA_ACTIVE_DAYS = "activeDays"
    private const val CHANNEL_ID = "manecomb-location"
    private const val NOTIFICATION_ID = 4107
    private const val TAG = "ManeCombLocation"
    private const val WAKE_LOCK_TAG = "ManeComb:LocationUpload"
    private const val HTTP_TIMEOUT_MS = 10000L
    private const val WAKE_LOCK_TIMEOUT_MS = 15000L
    private const val RETRY_BASE_MS = 5000L
    private const val RETRY_MAX_MS = 60000L
    private const val SCHEDULE_RECHECK_MS =
      ManeCombLocationCadence.PROVIDER_RECOVERY_INTERVAL_MS
    private const val MAX_PENDING_LOCATIONS = 1440
    private const val MAX_PENDING_AGE_MS = 24L * 60L * 60L * 1000L
    const val PREFS_NAME = "manecomb-location-service"
    const val KEY_SERVICE_ENABLED = "serviceEnabled"
    private const val KEY_API_URL = "apiUrl"
    const val KEY_TOKEN = "token"
    const val KEY_REFRESH_TOKEN = "refreshToken"
    const val KEY_STATUS_REASON = "statusReason"
    const val KEY_VEHICLE_ID = "vehicleId"
    const val KEY_SESSION_ID = "sessionId"
    const val KEY_PENDING_COUNT = "pendingCount"
    const val KEY_DROPPED_COUNT = "droppedCount"
    const val KEY_TRACKING_ACTIVE = "trackingActive"
    const val KEY_LAST_CAPTURED_AT = "lastCapturedAt"
    const val KEY_LAST_SENT_AT = "lastSentAt"
    const val KEY_LAST_CONFIRMED_AT = "lastConfirmedAt"
    private const val KEY_SCHEDULE_ENABLED = "scheduleEnabled"
    private const val KEY_SCHEDULE_START = "scheduleStart"
    private const val KEY_SCHEDULE_END = "scheduleEnd"
    private const val KEY_ACTIVE_DAYS = "activeDays"
    private const val KEY_PENDING_LOCATIONS = "pendingLocations"
    private const val KEY_PENDING_OWNER_VEHICLE_ID = "pendingOwnerVehicleId"
    @Volatile private var activeService: ManeCombLocationService? = null

    fun hardResetPersistedState(context: Context) {
      activeService?.hardStopImmediately()
      val preferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      ManeCombLocationCredentials.clear(preferences)
      preferences.edit()
        .putBoolean(KEY_SERVICE_ENABLED, false)
        .putBoolean(KEY_TRACKING_ACTIVE, false)
        .remove(KEY_API_URL)
        .remove(KEY_VEHICLE_ID)
        .remove(KEY_SESSION_ID)
        .remove(KEY_STATUS_REASON)
        .remove(KEY_SCHEDULE_ENABLED)
        .remove(KEY_SCHEDULE_START)
        .remove(KEY_SCHEDULE_END)
        .remove(KEY_ACTIVE_DAYS)
        .remove(KEY_PENDING_LOCATIONS)
        .remove(KEY_PENDING_OWNER_VEHICLE_ID)
        .remove(KEY_LAST_CAPTURED_AT)
        .remove(KEY_LAST_SENT_AT)
        .remove(KEY_LAST_CONFIRMED_AT)
        .putInt(KEY_PENDING_COUNT, 0)
        .putInt(KEY_DROPPED_COUNT, 0)
        .apply()
      context.stopService(Intent(context, ManeCombLocationService::class.java))
    }

    fun buildIntentFromPrefs(context: Context): Intent? {
      val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
      if (!prefs.getBoolean(KEY_SERVICE_ENABLED, false)) {
        return null
      }

      val apiUrl = prefs.getString(KEY_API_URL, "").orEmpty()
      val credentials = ManeCombLocationCredentials.read(prefs)
      val token = credentials?.token.orEmpty()
      val refreshToken = credentials?.refreshToken.orEmpty()
      val vehicleId = prefs.getString(KEY_VEHICLE_ID, "").orEmpty()
      if (apiUrl.isBlank() || token.isBlank() || vehicleId.isBlank()) {
        hardResetPersistedState(context)
        return null
      }

      return Intent().apply {
        component = ComponentName(context, ManeCombLocationService::class.java)
        action = ACTION_RESTORE
        putExtra(EXTRA_API_URL, apiUrl)
        putExtra(EXTRA_TOKEN, token)
        putExtra(EXTRA_REFRESH_TOKEN, refreshToken)
        putExtra(EXTRA_VEHICLE_ID, vehicleId)
        putExtra(EXTRA_SESSION_ID, prefs.getString(KEY_SESSION_ID, "").orEmpty())
        putExtra(EXTRA_SCHEDULE_ENABLED, prefs.getBoolean(KEY_SCHEDULE_ENABLED, true))
        putExtra(EXTRA_SCHEDULE_START, prefs.getString(KEY_SCHEDULE_START, "").orEmpty())
        putExtra(EXTRA_SCHEDULE_END, prefs.getString(KEY_SCHEDULE_END, "").orEmpty())
        putExtra(EXTRA_ACTIVE_DAYS, prefs.getString(KEY_ACTIVE_DAYS, "").orEmpty())
      }
    }

    fun startFromPersistedConfig(context: Context): Boolean {
      val intent = buildIntentFromPrefs(context) ?: return false
      return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          context.startForegroundService(intent)
        } else {
          context.startService(intent)
        }
        true
      } catch (error: Exception) {
        Log.w(TAG, "Could not restore background GPS service.", error)
        false
      }
    }
  }
}
