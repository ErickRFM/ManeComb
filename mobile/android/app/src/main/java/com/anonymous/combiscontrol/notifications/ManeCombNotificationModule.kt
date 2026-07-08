package com.anonymous.combiscontrol.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import kotlin.math.abs

class ManeCombNotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ManeCombNotification"

  @ReactMethod
  fun show(title: String, body: String, category: String, promise: Promise) {
    try {
      val normalizedCategory = category.trim().lowercase()
      val channelId = channelIdForCategory(normalizedCategory)
      val priority = priorityForCategory(normalizedCategory)
      ensureChannels()

      if (
        Build.VERSION.SDK_INT >= 33 &&
        ContextCompat.checkSelfPermission(reactContext, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(false)
        return
      }

      val intent = Intent(reactContext, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
      }
      val pendingIntent = PendingIntent.getActivity(
        reactContext,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
      )
      val builder = NotificationCompat.Builder(reactContext, channelId)
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(R.drawable.notification_icon)
        .setAutoCancel(true)
        .setContentIntent(pendingIntent)
        .setPriority(priority)

      if (
        normalizedCategory == "sos" ||
        normalizedCategory == "emergency" ||
        normalizedCategory == "emergencies" ||
        normalizedCategory == "emergencia" ||
        normalizedCategory == "emergencias"
      ) {
        builder
          .setCategory(NotificationCompat.CATEGORY_ALARM)
          .setFullScreenIntent(pendingIntent, true)
      } else if (normalizedCategory == "radio") {
        builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)
      }

      val notification = builder.build()

      NotificationManagerCompat.from(reactContext).notify(
        abs("${normalizedCategory}:${System.currentTimeMillis()}".hashCode()),
        notification
      )
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_show_failed", error.message, error)
    }
  }

  private fun ensureChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }

    val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val general = NotificationChannel(
      CHANNEL_GENERAL,
      "Operacion ManeComb",
      NotificationManager.IMPORTANCE_DEFAULT
    )
    general.description = "Mensajes operativos"
    manager.createNotificationChannel(general)

    val radio = NotificationChannel(
      CHANNEL_RADIO,
      "Radio operativa",
      NotificationManager.IMPORTANCE_HIGH
    )
    radio.description = "Transmisiones de radio"
    manager.createNotificationChannel(radio)

    val incidents = NotificationChannel(
      CHANNEL_INCIDENTS,
      "Incidentes",
      NotificationManager.IMPORTANCE_HIGH
    )
    incidents.description = "Incidentes operativos"
    manager.createNotificationChannel(incidents)

    val emergencies = NotificationChannel(
      CHANNEL_EMERGENCIES,
      "Emergencias",
      NotificationManager.IMPORTANCE_HIGH
    )
    emergencies.description = "Eventos criticos de emergencia"
    emergencies.enableVibration(true)
    manager.createNotificationChannel(emergencies)

    val sos = NotificationChannel(
      CHANNEL_SOS,
      "Alertas SOS",
      NotificationManager.IMPORTANCE_HIGH
    )
    sos.description = "Alertas criticas de seguridad"
    sos.enableVibration(true)
    manager.createNotificationChannel(sos)
  }

  private fun channelIdForCategory(category: String): String =
    when (category) {
      "emergency", "emergencies", "emergencia", "emergencias" -> CHANNEL_EMERGENCIES
      "incident", "incidents", "incidente", "incidencias" -> CHANNEL_INCIDENTS
      "radio" -> CHANNEL_RADIO
      "sos" -> CHANNEL_SOS
      else -> CHANNEL_GENERAL
    }

  private fun priorityForCategory(category: String): Int =
    when (category) {
      "emergency", "emergencies", "emergencia", "emergencias" -> NotificationCompat.PRIORITY_MAX
      "incident", "incidents", "incidente", "incidencias" -> NotificationCompat.PRIORITY_HIGH
      "radio" -> NotificationCompat.PRIORITY_HIGH
      "sos" -> NotificationCompat.PRIORITY_MAX
      else -> NotificationCompat.PRIORITY_DEFAULT
    }

  companion object {
    private const val CHANNEL_GENERAL = "operacion-general"
    private const val CHANNEL_RADIO = "operacion-radio"
    private const val CHANNEL_INCIDENTS = "operacion-incidentes"
    private const val CHANNEL_EMERGENCIES = "operacion-emergencias"
    private const val CHANNEL_SOS = "operacion-sos"
  }
}
