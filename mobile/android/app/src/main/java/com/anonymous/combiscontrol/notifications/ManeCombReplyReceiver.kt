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
    const val EXTRA_TEXT = "replyText"

    /**
     * Reemplaza la tarjeta por un estado final sin accion de responder, como hace WhatsApp.
     */
    fun updateNotification(context: Context, notificationId: Int, status: String) {
      val notification = NotificationCompat.Builder(
        context,
        ManeCombNotificationModule.CHANNEL_GENERAL
      )
        .setContentTitle("Respuesta")
        .setContentText(status)
        .setSmallIcon(R.drawable.notification_icon)
        .setAutoCancel(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

      try {
        NotificationManagerCompat.from(context).notify(notificationId, notification)
      } catch (error: SecurityException) {
        Log.w(TAG, "Sin permiso para actualizar la notificacion", error)
      }
    }
  }
}
