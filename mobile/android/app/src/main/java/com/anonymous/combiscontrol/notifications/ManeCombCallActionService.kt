package com.anonymous.combiscontrol.notifications

import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class ManeCombCallActionService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras: Bundle = intent?.extras ?: return null
    val callId = extras.getString(ManeCombCallActionReceiver.EXTRA_CALL_ID)?.trim().orEmpty()
    val action = extras.getString(ManeCombCallActionReceiver.EXTRA_ACTION)?.trim().orEmpty()
    if (callId.isEmpty() || action.isEmpty()) return null

    val data = Arguments.createMap().apply {
      putString("callId", callId)
      putString("action", action)
    }
    return HeadlessJsTaskConfig(TASK_NAME, data, TASK_TIMEOUT_MS, ALLOW_IN_FOREGROUND)
  }

  companion object {
    private const val TASK_NAME = "ManeCombCallNotificationAction"
    private const val TASK_TIMEOUT_MS = 20_000L
    private const val ALLOW_IN_FOREGROUND = true
  }
}
