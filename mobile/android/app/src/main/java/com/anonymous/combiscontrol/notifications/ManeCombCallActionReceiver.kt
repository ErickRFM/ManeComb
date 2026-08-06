package com.anonymous.combiscontrol.notifications

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Rechazar se ejecuta sin abrir la UI. La accion del usuario inicia un Headless JS Task
 * que recupera la sesion segura y emite rtc:reject por el socket autenticado.
 */
class ManeCombCallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != ACTION_REJECT) return
    val callId = intent.getStringExtra(EXTRA_CALL_ID)?.trim().orEmpty()
    if (callId.isEmpty()) return

    ManeCombPushNotificationRenderer.dismissCall(context, callId)
    val serviceIntent = Intent(context, ManeCombCallActionService::class.java).apply {
      putExtra(EXTRA_CALL_ID, callId)
      putExtra(EXTRA_ACTION, "reject")
    }

    try {
      context.startService(serviceIntent)
    } catch (error: Exception) {
      Log.w(TAG, "No fue posible iniciar la accion de llamada", error)
    }
  }

  companion object {
    private const val TAG = "ManeCombCallAction"
    const val ACTION_REJECT = "com.anonymous.combiscontrol.notifications.ACTION_REJECT_CALL"
    const val EXTRA_CALL_ID = "callId"
    const val EXTRA_ACTION = "callAction"
  }
}
