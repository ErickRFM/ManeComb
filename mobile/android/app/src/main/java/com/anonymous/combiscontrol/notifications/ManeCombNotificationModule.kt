package com.anonymous.combiscontrol.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlin.math.abs

class ManeCombNotificationModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "ManeCombNotification"

  @ReactMethod
  fun getPushToken(promise: Promise) {
    val stored = ManeCombPushTokenStore.read(reactContext)
    if (FirebaseApp.getApps(reactContext).isEmpty()) {
      promise.resolve(stored)
      return
    }

    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        promise.resolve(stored)
        return@addOnCompleteListener
      }
      val token = task.result?.trim().orEmpty()
      if (token.isNotEmpty()) ManeCombPushTokenStore.save(reactContext, token)
      promise.resolve(token.ifEmpty { stored })
    }
  }

  @ReactMethod
  fun deletePushToken(promise: Promise) {
    ManeCombPushTokenStore.clear(reactContext)
    if (FirebaseApp.getApps(reactContext).isEmpty()) {
      promise.resolve(true)
      return
    }
    FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener {
      promise.resolve(it.isSuccessful)
    }
  }

  /**
   * Socket/JS reaches the exact same native NotificationChannel authority as FCM.
   * No direct MediaPlayer/Vibrator path exists, so foreground cannot bypass the
   * user's channel settings or race a push with a second feedback mechanism.
   */
  @ReactMethod
  fun playOperationalAlert(
    incidentId: String?,
    category: String?,
    level: String?,
    severity: String?,
    title: String?,
    body: String?,
    deepLink: String?,
    promise: Promise
  ) {
    try {
      val emitted = ManeCombPushNotificationRenderer.showOperationalAlert(
        reactContext,
        mapOf(
          "incidentId" to incidentId?.trim().orEmpty(),
          "category" to category?.trim().orEmpty(),
          "level" to level?.trim().orEmpty(),
          "severity" to severity?.trim().orEmpty(),
          "title" to title?.trim().orEmpty(),
          "body" to body?.trim().orEmpty(),
          "deepLink" to deepLink?.trim().orEmpty()
        )
      )
      promise.resolve(emitted)
    } catch (error: Exception) {
      promise.reject("operational_alert_failed", error)
    }
  }

  @ReactMethod
  fun show(
    title: String,
    body: String,
    category: String,
    conversationId: String?,
    deepLink: String?,
    encrypted: Boolean,
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
        builder.setCategory(NotificationCompat.CATEGORY_MESSAGE)

        if (encrypted) {
          builder.setSubText(ENCRYPTED_REPLY_HINT)
        } else {
          builder.addAction(buildReplyAction(notificationId, safeConversationId))
        }
      }

      NotificationManagerCompat.from(reactContext).notify(notificationId, builder.build())
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("notification_show_failed", error.message, error)
    }
  }

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
    ManeCombPushNotificationRenderer.ensureChannels(reactContext)
    ManeCombAlertPolicy.ensureChannels(reactContext)
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

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

  // Las categorias operativas las resuelve ManeCombAlertPolicy, la unica politica
  // de feedback, para que este switch no pueda divergir del que aplica el
  // renderer de FCM. Aqui solo quedan las categorias que la politica no gobierna.
  private fun channelIdForCategory(category: String): String =
    ManeCombAlertPolicy.resolve(category, null)?.channelId
      ?: when (category) {
        "radio" -> CHANNEL_RADIO
        "chat" -> ManeCombPushNotificationRenderer.CHANNEL_CHAT
        else -> CHANNEL_GENERAL
      }

  private fun priorityForCategory(category: String): Int =
    ManeCombAlertPolicy.resolve(category, null)?.priority
      ?: when (category) {
        "radio", "chat" -> NotificationCompat.PRIORITY_HIGH
        else -> NotificationCompat.PRIORITY_DEFAULT
      }

  companion object {
    const val KEY_REPLY_TEXT = "reply_text"
    const val ACTION_REPLY = "com.anonymous.combiscontrol.notifications.ACTION_REPLY"
    const val EXTRA_CONVERSATION_ID = "conversationId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
    const val CHANNEL_GENERAL = "operacion-general"
    private const val REPLY_LABEL = "Responder"
    private const val ENCRYPTED_REPLY_HINT = "Chat cifrado: abre la app para responder"
    private const val CHANNEL_RADIO = "operacion-radio"
    private const val CHANNEL_INCIDENTS = "operacion-incidentes"
    private const val CHANNEL_EMERGENCIES = "operacion-emergencias"
    private const val CHANNEL_SOS = "operacion-sos"

    fun notificationIdFor(category: String, conversationId: String): Int =
      if (conversationId.isNotEmpty()) {
        abs("chat:$conversationId".hashCode())
      } else {
        abs("$category:${System.currentTimeMillis()}".hashCode())
      }
  }
}
