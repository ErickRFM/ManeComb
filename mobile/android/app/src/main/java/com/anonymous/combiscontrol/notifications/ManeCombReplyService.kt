package com.anonymous.combiscontrol.notifications

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Levanta el bundle de JS en background para enviar la respuesta escrita desde la notificacion.
 */
class ManeCombReplyService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: return null
    val conversationId = extras
      .getString(ManeCombNotificationModule.EXTRA_CONVERSATION_ID)
      ?.trim()
      .orEmpty()
    val text = extras.getString(ManeCombReplyReceiver.EXTRA_TEXT)?.trim().orEmpty()

    if (conversationId.isEmpty() || text.isEmpty()) {
      return null
    }

    val data = Arguments.createMap().apply {
      putString("conversationId", conversationId)
      putString("text", text)
      putInt(
        "notificationId",
        extras.getInt(ManeCombNotificationModule.EXTRA_NOTIFICATION_ID, 0)
      )
    }

    return HeadlessJsTaskConfig(TASK_NAME, data, TASK_TIMEOUT_MS, ALLOW_IN_FOREGROUND)
  }

  companion object {
    private const val TASK_NAME = "ManeCombNotificationReply"
    private const val TASK_TIMEOUT_MS = 30000L
    private const val ALLOW_IN_FOREGROUND = true
  }
}
