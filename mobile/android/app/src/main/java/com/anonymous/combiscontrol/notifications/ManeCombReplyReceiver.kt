package com.anonymous.combiscontrol.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import com.anonymous.combiscontrol.R

/**
 * Recibe la respuesta escrita desde la notificacion de chat y delega el envio real
 * a un Headless JS Task, para no depender de que la app este abierta.
 */
class ManeCombReplyReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent == null || intent.action != ManeCombNotificationModule.ACTION_REPLY) {
      return
    }

    val conversationId = intent
      .getStringExtra(ManeCombNotificationModule.EXTRA_CONVERSATION_ID)
      ?.trim()
      .orEmpty()
    val notificationId = intent.getIntExtra(ManeCombNotificationModule.EXTRA_NOTIFICATION_ID, 0)
    val text = RemoteInput.getResultsFromIntent(intent)
      ?.getCharSequence(ManeCombNotificationModule.KEY_REPLY_TEXT)
      ?.toString()
      ?.trim()
      .orEmpty()

    if (conversationId.isEmpty() || text.isEmpty()) {
      NotificationManagerCompat.from(context).cancel(notificationId)
      return
    }

    updateNotification(context, notificationId, "Enviando...")

    val serviceIntent = Intent(context, ManeCombReplyService::class.java).apply {
      putExtra(ManeCombNotificationModule.EXTRA_CONVERSATION_ID, conversationId)
      putExtra(ManeCombNotificationModule.EXTRA_NOTIFICATION_ID, notificationId)
      putExtra(EXTRA_TEXT, text)
    }

    try {
      context.startService(serviceIntent)
    } catch (error: Exception) {
      Log.w(TAG, "No fue posible iniciar el envio en background", error)
      updateNotification(context, notificationId, "No se pudo enviar")
    }
  }

  companion object {
    private const val TAG = "ManeCombReplyReceiver"
    private const val SENT_STATUS_TIMEOUT_MS = 1_800L
    const val EXTRA_TEXT = "replyText"

    /**
     * Reemplaza temporalmente la tarjeta por el estado del envio sin volver a
     * sonar/vibrar. Un envio exitoso desaparece solo; un error permanece para
     * que el usuario sepa que debe abrir ManeComb y reintentar.
     */
    fun updateNotification(context: Context, notificationId: Int, status: String) {
      ManeCombPushNotificationRenderer.ensureChannels(context)
      val sent = status.equals("Enviado", ignoreCase = true)
      val notification = NotificationCompat.Builder(
        context,
        ManeCombPushNotificationRenderer.CHANNEL_CHAT
      )
        .setContentTitle(if (sent) "Respuesta enviada" else "ManeComb")
        .setContentText(status)
        .setSmallIcon(R.drawable.notification_icon)
        .setAutoCancel(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
        .setGroup(ManeCombPushNotificationRenderer.GROUP_CHAT)
        .apply {
          if (sent) setTimeoutAfter(SENT_STATUS_TIMEOUT_MS)
        }
        .build()

      try {
        NotificationManagerCompat.from(context).notify(notificationId, notification)
      } catch (error: SecurityException) {
        Log.w(TAG, "Sin permiso para actualizar la notificacion", error)
      }
    }
  }
}
