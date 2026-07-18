package com.anonymous.combiscontrol.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
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
  fun show(
    title: String,
    body: String,
    category: String,
    conversationId: String?,
    deepLink: String?,
    promise: Promise
  ) {
    try {
      val normalizedCategory = category.trim().lowercase()
      val safeConversationId = conversationId?.trim().orEmpty()
      val safeDeepLink = deepLink?.trim().orEmpty()
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

      val notificationId = notificationIdFor(normalizedCategory, safeConversationId)

      val intent = Intent(reactContext, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        if (safeDeepLink.isNotEmpty()) {
          action = Intent.ACTION_VIEW
          data = Uri.parse(safeDeepLink)
        }
      }
      val pendingIntent = PendingIntent.getActivity(
        reactContext,
        notificationId,
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

      if (normalizedCategory == "chat" && safeConversationId.isNotEmpty()) {
        builder
          .setCategory(NotificationCompat.CATEGORY_MESSAGE)
          .addAction(buildReplyAction(notificationId, safeConversationId))
      }

      val notification = builder.build()

      NotificationManagerCompat.from(reactContext).notify(notificationId, notification)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_show_failed", error.message, error)
    }
  }

  /**
   * Usado por el Headless JS Task para cerrar el ciclo de la respuesta rapida.
   */
  @ReactMethod
  fun updateReplyStatus(notificationId: Double, status: String, promise: Promise) {
    try {
      ManeCombReplyReceiver.updateNotification(reactContext, notificationId.toInt(), status)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.resolve(false)
    }
  }

  private fun buildReplyAction(
    notificationId: Int,
    conversationId: String
  ): NotificationCompat.Action {
    val remoteInput = RemoteInput.Builder(KEY_REPLY_TEXT)
      .setLabel(REPLY_LABEL)
      .build()
    val replyIntent = Intent(reactContext, ManeCombReplyReceiver::class.java).apply {
      action = ACTION_REPLY
      putExtra(EXTRA_CONVERSATION_ID, conversationId)
      putExtra(EXTRA_NOTIFICATION_ID, notificationId)
    }
    // RemoteInput exige un PendingIntent mutable para poder inyectar el texto escrito.
    val replyPendingIntent = PendingIntent.getBroadcast(
      reactContext,
      notificationId,
      replyIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    )

    return NotificationCompat.Action.Builder(
      R.drawable.notification_icon,
      REPLY_LABEL,
      replyPendingIntent
    )
      .addRemoteInput(remoteInput)
      .setAllowGeneratedReplies(false)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .build()
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
    const val KEY_REPLY_TEXT = "reply_text"
    const val ACTION_REPLY = "com.anonymous.combiscontrol.notifications.ACTION_REPLY"
    const val EXTRA_CONVERSATION_ID = "conversationId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    const val CHANNEL_GENERAL = "operacion-general"
    private const val REPLY_LABEL = "Responder"
    private const val CHANNEL_RADIO = "operacion-radio"
    private const val CHANNEL_INCIDENTS = "operacion-incidentes"
    private const val CHANNEL_EMERGENCIES = "operacion-emergencias"
    private const val CHANNEL_SOS = "operacion-sos"

    /**
     * Los chats con conversacion conocida reutilizan un id estable para que la respuesta
     * desde la notificacion pueda actualizar esa misma tarjeta.
     */
    fun notificationIdFor(category: String, conversationId: String): Int =
      if (conversationId.isNotEmpty()) {
        abs("chat:$conversationId".hashCode())
      } else {
        abs("$category:${System.currentTimeMillis()}".hashCode())
      }
  }
}
