package com.anonymous.combiscontrol.notifications

import android.Manifest
import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.Person
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

object ManeCombPushNotificationRenderer {
  const val CHANNEL_CHAT = "manecomb-chat-messages"
  const val CHANNEL_CALLS = "manecomb-incoming-calls"
  const val GROUP_CHAT = "manecomb-chat"
  private const val ENCRYPTED_REPLY_HINT = "Chat cifrado: abre la app para responder"
  private const val DEFAULT_CALL_RING_TIMEOUT_MS = 35_000L

  fun render(context: Context, data: Map<String, String>) {
    when (data["type"]?.trim()?.lowercase()) {
      "call_dismiss", "call_ended", "call_cancelled", "call_timeout" -> {
        dismissCall(context, data["callId"].orEmpty())
      }
      "incoming_call" -> {
        if (!isAppInForeground(context)) showIncomingCall(context, data)
      }
      else -> {
        if (!isAppInForeground(context)) showMessage(context, data)
      }
    }
  }

  fun showMessage(context: Context, data: Map<String, String>) {
    if (!canPostNotifications(context)) return
    ensureChannels(context)

    val title = data["title"].orEmpty().ifBlank { "ManeComb" }
    val body = data["body"].orEmpty().ifBlank { "Tienes una notificación nueva." }
    val conversationId = data["conversationId"].orEmpty().trim()
    // Bandera ausente o desconocida => cifrado. Solo un `false` explicito habilita RemoteInput.
    val encrypted = !data["encrypted"].orEmpty().equals("false", ignoreCase = true)
    val notificationId = stableId("chat:${conversationId.ifBlank { title }}")
    val contentIntent = activityIntent(
      context,
      notificationId,
      normalizeDeepLink(data["deepLink"], "/chat")
    )
    val sender = Person.Builder().setName(title).build()
    val style = NotificationCompat.MessagingStyle(sender)
      .setConversationTitle(title)
      .addMessage(body, System.currentTimeMillis(), sender)

    val builder = NotificationCompat.Builder(context, CHANNEL_CHAT)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(style)
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_MESSAGE)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(true)
      .setGroup(GROUP_CHAT)

    if (conversationId.isNotEmpty()) {
      if (encrypted) {
        builder.setSubText(ENCRYPTED_REPLY_HINT)
      } else {
        builder.addAction(buildReplyAction(context, notificationId, conversationId))
      }
    }

    NotificationManagerCompat.from(context).notify(notificationId, builder.build())
  }

  fun showIncomingCall(context: Context, data: Map<String, String>) {
    val callId = data["callId"].orEmpty().trim()
    if (callId.isEmpty()) return
    val callTimeoutMs = remainingCallTimeoutMs(data)
    if (callTimeoutMs <= 0L) return
    if (!canPostNotifications(context)) return
    ensureChannels(context)

    val callerName = data["callerName"].orEmpty().ifBlank { "Contacto operativo" }
    val mode = data["mode"].orEmpty().ifBlank { "audio" }
    val notificationId = stableId("call:$callId")
    val viewUri = callDeepLink(data, "incoming")
    val acceptUri = callDeepLink(data, "accept")
    val contentIntent = activityIntent(context, notificationId, viewUri)
    val acceptIntent = activityIntent(context, notificationId + 1, acceptUri)
    val rejectIntent = PendingIntent.getBroadcast(
      context,
      notificationId + 2,
      Intent(context, ManeCombCallActionReceiver::class.java).apply {
        action = ManeCombCallActionReceiver.ACTION_REJECT
        putExtra(ManeCombCallActionReceiver.EXTRA_CALL_ID, callId)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
    val caller = Person.Builder().setName(callerName).setImportant(true).build()
    val builder = NotificationCompat.Builder(context, CHANNEL_CALLS)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(callerName)
      .setContentText(if (mode == "video") "Videollamada entrante" else "Llamada de audio entrante")
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(false)
      .setOngoing(true)
      .setTimeoutAfter(callTimeoutMs)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      builder.setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, rejectIntent, acceptIntent))
    } else {
      builder
        .addAction(R.drawable.notification_icon, "Rechazar", rejectIntent)
        .addAction(R.drawable.notification_icon, "Responder", acceptIntent)
    }

    if (canUseFullScreenIntent(context)) {
      // La pantalla completa solo muestra el timbre. Aceptar siempre exige el toque explicito
      // del usuario sobre la accion Responder, antes de abrir microfono/camara.
      builder.setFullScreenIntent(contentIntent, true)
    }

    NotificationManagerCompat.from(context).notify(notificationId, builder.build())
  }

  fun dismissCall(context: Context, callId: String) {
    val safeCallId = callId.trim()
    if (safeCallId.isEmpty()) return
    NotificationManagerCompat.from(context).cancel(stableId("call:$safeCallId"))
  }

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)

    val chat = NotificationChannel(
      CHANNEL_CHAT,
      "Mensajes y chat",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Mensajes operativos de ManeComb"
      enableVibration(true)
    }
    manager.createNotificationChannel(chat)

    val ringtone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    val calls = NotificationChannel(
      CHANNEL_CALLS,
      "Llamadas entrantes",
      NotificationManager.IMPORTANCE_HIGH
    ).apply {
      description = "Llamadas de audio y video de ManeComb"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 700, 350, 700, 350, 900)
      setSound(
        ringtone,
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .build()
      )
      lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(calls)
  }

  private fun buildReplyAction(
    context: Context,
    notificationId: Int,
    conversationId: String
  ): NotificationCompat.Action {
    val remoteInput = RemoteInput.Builder(ManeCombNotificationModule.KEY_REPLY_TEXT)
      .setLabel("Responder")
      .build()
    val replyIntent = Intent(context, ManeCombReplyReceiver::class.java).apply {
      action = ManeCombNotificationModule.ACTION_REPLY
      putExtra(ManeCombNotificationModule.EXTRA_CONVERSATION_ID, conversationId)
      putExtra(ManeCombNotificationModule.EXTRA_NOTIFICATION_ID, notificationId)
    }
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      notificationId,
      replyIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    )

    return NotificationCompat.Action.Builder(
      R.drawable.notification_icon,
      "Responder",
      pendingIntent
    )
      .addRemoteInput(remoteInput)
      .setAllowGeneratedReplies(false)
      .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
      .build()
  }

  private fun activityIntent(context: Context, requestCode: Int, uri: Uri): PendingIntent =
    PendingIntent.getActivity(
      context,
      requestCode,
      Intent(context, MainActivity::class.java).apply {
        action = Intent.ACTION_VIEW
        data = uri
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun normalizeDeepLink(value: String?, fallbackPath: String): Uri {
    val raw = value.orEmpty().trim()
    if (raw.startsWith("manecomb:") || raw.startsWith("https://")) return Uri.parse(raw)
    val path = if (raw.startsWith("/")) raw else fallbackPath
    return Uri.parse("manecomb://$path")
  }

  private fun callDeepLink(data: Map<String, String>, action: String): Uri {
    val builder = Uri.parse("manecomb:///call").buildUpon()
      .appendQueryParameter("callId", data["callId"].orEmpty())
      .appendQueryParameter("conversationId", data["conversationId"].orEmpty())
      .appendQueryParameter("callerId", data["callerId"].orEmpty())
      .appendQueryParameter("callerName", data["callerName"].orEmpty())
      .appendQueryParameter("mode", data["mode"].orEmpty().ifBlank { "audio" })
      .appendQueryParameter("expiresAt", data["expiresAt"].orEmpty())
      .appendQueryParameter("ringTimeoutMs", data["ringTimeoutMs"].orEmpty())
      .appendQueryParameter("action", action)
    return builder.build()
  }

  private fun isAppInForeground(context: Context): Boolean {
    val processInfo = ActivityManager.RunningAppProcessInfo()
    ActivityManager.getMyMemoryState(processInfo)
    return processInfo.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
  }

  private fun canPostNotifications(context: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      ContextCompat.checkSelfPermission(
        context,
        Manifest.permission.POST_NOTIFICATIONS
      ) == PackageManager.PERMISSION_GRANTED

  private fun canUseFullScreenIntent(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < 34) return true
    val manager = context.getSystemService(NotificationManager::class.java)
    return manager.canUseFullScreenIntent()
  }

  private fun parseUtcMillis(value: String?): Long? {
    val raw = value.orEmpty().trim()
    if (raw.isEmpty()) return null
    return try {
      val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }
      parser.parse(raw)?.time
    } catch (_: Exception) {
      null
    }
  }

  private fun remainingCallTimeoutMs(data: Map<String, String>): Long {
    val relativeLimit = data["ringTimeoutMs"]
      ?.trim()
      ?.toLongOrNull()
      ?.takeIf { it > 0L }
      ?: DEFAULT_CALL_RING_TIMEOUT_MS
    val expiresAtMillis = parseUtcMillis(data["expiresAt"]) ?: return relativeLimit
    val remainingMs = expiresAtMillis - System.currentTimeMillis()
    return minOf(relativeLimit, remainingMs.coerceAtLeast(0L))
  }

  private fun stableId(value: String): Int = value.hashCode() and 0x7fffffff
}
