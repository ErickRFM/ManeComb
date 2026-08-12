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
import java.util.Date
import java.util.Locale
import java.util.TimeZone

object ManeCombPushNotificationRenderer {
  const val CHANNEL_CHAT = "manecomb-chat-messages"
  // NotificationChannel conserva sonido/importancia despues de crearse. El canal v2
  // evita que una instalacion que tuvo el canal historico silencioso siga heredando
  // esa configuracion cuando recibe una llamada con la app en background o cerrada.
  const val CHANNEL_CALLS = "manecomb-incoming-calls-v2"
  const val GROUP_CHAT = "manecomb-chat"
  private const val E2EE_REPLY_SUBTEXT = "Cifrado de extremo a extremo"
  private const val DEFAULT_CALL_RING_TIMEOUT_MS = 35_000L
  private const val CLOCK_SKEW_FALLBACK_RING_MS = 10_000L
  private val CALL_VIBRATION_PATTERN = longArrayOf(0, 700, 350, 700, 350, 900)

  private data class CallDeadline(
    val timeoutMs: Long,
    val localExpiresAt: String
  )

  fun render(context: Context, data: Map<String, String>) {
    // `category` primero: para incidencias `data["type"]` trae el tipo de negocio
    // ("mecanica", "accidente"), no un discriminador de mensaje, asi que
    // conmutar por `type` las hacia caer en la rama de chat.
    if (ManeCombAlertPolicy.isOperationalAlert(data["category"])) {
      showOperationalAlert(context, data)
      return
    }

    when (data["type"]?.trim()?.lowercase()) {
      "call_dismiss", "call_ended", "call_cancelled", "call_timeout" -> {
        renderCallDismiss(context, data)
      }
      "incoming_call" -> renderIncomingCall(context, data)
      else -> {
        if (!isAppInForeground(context)) showMessage(context, data)
      }
    }
  }

  /**
   * Alertas operativas (incidencias y SOS). Nunca usan el canal de chat, ni
   * MessagingStyle, ni el fallback de deep link a /chat.
   */
  fun showOperationalAlert(context: Context, data: Map<String, String>): Boolean {
    // Foreground and background intentionally share this exact path. Posting
    // through NotificationChannel lets Android honor the user-selected sound,
    // vibration, importance, DND and mute policy instead of bypassing it with
    // MediaPlayer/Vibrator when JS happens to be alive.
    if (!canPostNotifications(context)) return false

    val feedback = ManeCombAlertPolicy.resolve(
      data["category"],
      data["level"],
      data["severity"]
    ) ?: return false

    val incidentId = data["incidentId"].orEmpty().trim()
    val title = data["title"].orEmpty().ifBlank { "ManeComb" }
    val body = data["body"].orEmpty().ifBlank { "Nueva alerta operativa." }

    if (!ManeCombAlertPolicy.shouldEmitAlert(
        incidentId.ifEmpty { title },
        System.currentTimeMillis()
      )
    ) {
      return false
    }

    ManeCombAlertPolicy.ensureChannels(context)

    val notificationId = ManeCombAlertPolicy.notificationIdFor(incidentId, title)
    val contentIntent = activityIntent(
      context,
      notificationId,
      normalizeDeepLink(data["deepLink"], "/incidencias")
    )

    // Lockscreen public version never reuses business title/body. The private
    // notification still contains the operational detail after unlock.
    val publicTitle = if (feedback.channelId == ManeCombAlertPolicy.CHANNEL_SOS) {
      "Alerta SOS de ManeComb"
    } else {
      "Alerta operativa de ManeComb"
    }
    val publicVersion = NotificationCompat.Builder(context, feedback.channelId)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(publicTitle)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .build()

    val builder = NotificationCompat.Builder(context, feedback.channelId)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_EVENT)
      .setPriority(feedback.priority)
      .setAutoCancel(true)
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .setPublicVersion(publicVersion)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder.setSound(ManeCombAlertPolicy.soundUri(context, feedback))
      builder.setVibrate(feedback.vibrationPattern)
    }

    NotificationManagerCompat.from(context).notify(notificationId, builder.build())
    return true
  }

  fun showMessage(context: Context, data: Map<String, String>) {
    if (!canPostNotifications(context)) return
    ensureChannels(context)

    val title = data["title"].orEmpty().ifBlank { "ManeComb" }
    val body = data["body"].orEmpty().ifBlank { "Tienes una notificación nueva." }
    val conversationId = data["conversationId"].orEmpty().trim()
    // Esta bandera solo presenta contexto visual. La autoridad real para decidir
    // si la respuesta debe cifrarse vive en el Headless JS task y consulta la
    // conversacion + llave local; nunca se confia en el push para seguridad.
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
      .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)

    if (conversationId.isNotEmpty()) {
      builder.addAction(buildReplyAction(context, notificationId, conversationId))
      if (encrypted) {
        builder.setSubText(E2EE_REPLY_SUBTEXT)
      }
    }

    NotificationManagerCompat.from(context).notify(notificationId, builder.build())
  }

  private fun renderCallDismiss(context: Context, data: Map<String, String>) {
    val callId = data["callId"].orEmpty().trim()
    if (callId.isEmpty()) return
    dismissCall(context, callId)
    if (isAppInForeground(context)) {
      deliverCallDismissToForeground(context, data, callId)
    }
  }

  private fun renderIncomingCall(context: Context, data: Map<String, String>) {
    val callId = data["callId"].orEmpty().trim()
    if (callId.isEmpty()) return
    val deadline = resolveCallDeadline(data)
    if (deadline.timeoutMs <= 0L) return

    // Socket.IO sigue siendo el transporte normal. Si justo esta reconectando pero el proceso
    // esta foreground, FCM entrega el mismo URI que CallOverlay ya consume via Linking. No se
    // crea un segundo store/event bus y el backend sigue validando cualquier accept.
    if (isAppInForeground(context) && deliverIncomingCallToForeground(context, data, deadline)) {
      dismissCall(context, callId)
      return
    }

    showIncomingCallNotification(context, data, callId, deadline)
  }

  fun showIncomingCall(context: Context, data: Map<String, String>) {
    val callId = data["callId"].orEmpty().trim()
    if (callId.isEmpty()) return
    val deadline = resolveCallDeadline(data)
    if (deadline.timeoutMs <= 0L) return
    showIncomingCallNotification(context, data, callId, deadline)
  }

  private fun showIncomingCallNotification(
    context: Context,
    data: Map<String, String>,
    callId: String,
    deadline: CallDeadline
  ) {
    if (!canPostNotifications(context)) return
    ensureChannels(context)

    val callerName = data["callerName"].orEmpty().ifBlank { "Contacto operativo" }
    val mode = data["mode"].orEmpty().ifBlank { "audio" }
    val notificationId = stableId("call:$callId")
    val viewUri = callDeepLink(data, "incoming", deadline)
    val acceptUri = callDeepLink(data, "accept", deadline)
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
      .setTimeoutAfter(deadline.timeoutMs)

    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      builder
        .setSound(defaultIncomingCallSound())
        .setVibrate(CALL_VIBRATION_PATTERN)
    }

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

  private fun deliverIncomingCallToForeground(
    context: Context,
    data: Map<String, String>,
    deadline: CallDeadline
  ): Boolean {
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      this.data = callDeepLink(data, "incoming", deadline)
      putExtra(
        MainActivity.EXTRA_INTERNAL_CALL_INTENT_TOKEN,
        MainActivity.internalCallIntentToken(context)
      )
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    return try {
      context.startActivity(intent)
      true
    } catch (_: Exception) {
      false
    }
  }

  private fun deliverCallDismissToForeground(
    context: Context,
    data: Map<String, String>,
    callId: String
  ) {
    val reason = data["reason"].orEmpty().ifBlank {
      data["type"].orEmpty().removePrefix("call_").ifBlank { "ended" }
    }
    val uri = Uri.parse("manecomb:///call").buildUpon()
      .appendQueryParameter("callId", callId)
      .appendQueryParameter("action", "dismiss")
      .appendQueryParameter("reason", reason)
      .build()
    val intent = Intent(context, MainActivity::class.java).apply {
      action = Intent.ACTION_VIEW
      this.data = uri
      putExtra(
        MainActivity.EXTRA_INTERNAL_CALL_INTENT_TOKEN,
        MainActivity.internalCallIntentToken(context)
      )
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_SINGLE_TOP or
        Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    try {
      context.startActivity(intent)
    } catch (_: Exception) {
      // La autoridad backend ya termino la llamada; este intent solo reconcilia UI foreground.
    }
  }

  fun dismissCall(context: Context, callId: String) {
    val safeCallId = callId.trim()
    if (safeCallId.isEmpty()) return
    NotificationManagerCompat.from(context).cancel(stableId("call:$safeCallId"))
  }

  fun ensureChannels(context: Context) {
    // Los canales de alerta operativa los define la politica unica.
    ManeCombAlertPolicy.ensureChannels(context)
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

    // El ID se versiona a proposito: Android conserva sonido/importancia del canal
    // ya creado y no permite que una actualizacion de la app repare un canal viejo
    // que quedo silencioso. Las nuevas llamadas usan exclusivamente este canal v2.
    val calls = NotificationChannel(
      CHANNEL_CALLS,
      "Llamadas entrantes",
      NotificationManager.IMPORTANCE_MAX
    ).apply {
      description = "Llamadas de audio y video de ManeComb"
      enableVibration(true)
      vibrationPattern = CALL_VIBRATION_PATTERN
      setSound(
        defaultIncomingCallSound(),
        AudioAttributes.Builder()
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
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
        putExtra(
          MainActivity.EXTRA_INTERNAL_CALL_INTENT_TOKEN,
          MainActivity.internalCallIntentToken(context)
        )
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

  private fun callDeepLink(data: Map<String, String>, action: String, deadline: CallDeadline): Uri {
    val builder = Uri.parse("manecomb:///call").buildUpon()
      .appendQueryParameter("callId", data["callId"].orEmpty())
      .appendQueryParameter("conversationId", data["conversationId"].orEmpty())
      .appendQueryParameter("callerId", data["callerId"].orEmpty())
      .appendQueryParameter("callerName", data["callerName"].orEmpty())
      .appendQueryParameter("mode", data["mode"].orEmpty().ifBlank { "audio" })
      // Desde FCM se convierte una sola vez a reloj local. A partir de aqui Android y JS
      // comparten el mismo deadline relativo aunque el reloj de pared del equipo este sesgado.
      .appendQueryParameter("expiresAt", deadline.localExpiresAt)
      .appendQueryParameter("ringTimeoutMs", deadline.timeoutMs.toString())
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

  private fun defaultIncomingCallSound(): Uri =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

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

  private fun formatUtcMillis(value: Long): String {
    val formatter = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    return formatter.format(Date(value))
  }

  private fun resolveCallDeadline(data: Map<String, String>): CallDeadline {
    val relativeLimit = data["ringTimeoutMs"]
      ?.trim()
      ?.toLongOrNull()
      ?.takeIf { it > 0L }
      ?: DEFAULT_CALL_RING_TIMEOUT_MS
    val nowMs = System.currentTimeMillis()
    val expiresAtMillis = parseUtcMillis(data["expiresAt"])
    if (expiresAtMillis == null) {
      return CallDeadline(relativeLimit, formatUtcMillis(nowMs + relativeLimit))
    }

    val localRemainingMs = expiresAtMillis - nowMs
    val fcmSentTimeMs = data["fcmSentTimeMs"]?.trim()?.toLongOrNull()?.takeIf { it > 0L }
    val fcmTtlMs = data["fcmTtlSeconds"]
      ?.trim()
      ?.toLongOrNull()
      ?.takeIf { it > 0L }
      ?.times(1000L)

    val timeoutMs = if (fcmSentTimeMs != null && fcmTtlMs != null) {
      // `expiresAt` y FCM `sentTime` son tiempos originados fuera del reloj del telefono.
      // La diferencia entre ambos produce un presupuesto de ringing independiente del skew.
      val serverWindowMs = minOf(
        relativeLimit,
        fcmTtlMs,
        (expiresAtMillis - fcmSentTimeMs).coerceAtLeast(0L)
      )
      if (serverWindowMs <= 0L) {
        0L
      } else if (localRemainingMs in 1..serverWindowMs) {
        // El reloj local es compatible con la ventana que FCM acaba de admitir: conserva
        // el tiempo realmente transcurrido durante transporte/arranque.
        localRemainingMs
      } else {
        // Sin una referencia online no se puede separar matematicamente skew de demora FCM.
        // Se evita descartar una llamada valida por reloj manual y se limita el posible
        // ringing fantasma; cualquier accept sigue validado por la autoridad Redis/backend.
        minOf(serverWindowMs, CLOCK_SKEW_FALLBACK_RING_MS)
      }
    } else {
      minOf(relativeLimit, localRemainingMs.coerceAtLeast(0L))
    }

    return CallDeadline(timeoutMs, formatUtcMillis(nowMs + timeoutMs))
  }

  private fun stableId(value: String): Int = value.hashCode() and 0x7fffffff
}
