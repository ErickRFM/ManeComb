package com.anonymous.combiscontrol.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Entrada nativa de FCM. Los mensajes son data-only para que el mismo renderer se ejecute
 * con la app abierta, en segundo plano o con el proceso recreado por Android.
 */
class ManeCombFirebaseMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    super.onNewToken(token)
    ManeCombPushTokenStore.save(applicationContext, token)
    Log.i(TAG, "Token FCM renovado; se registrará con la siguiente sesión autenticada")
  }

  override fun onMessageReceived(message: RemoteMessage) {
    super.onMessageReceived(message)
    val data = message.data.toMutableMap()
    message.notification?.let { notification ->
      if (data["title"].isNullOrBlank()) data["title"] = notification.title.orEmpty()
      if (data["body"].isNullOrBlank()) data["body"] = notification.body.orEmpty()
    }

    try {
      ManeCombPushNotificationRenderer.render(applicationContext, data)
    } catch (error: Exception) {
      Log.e(TAG, "No fue posible renderizar la notificación FCM", error)
    }
  }

  companion object {
    private const val TAG = "ManeCombFCM"
  }
}
