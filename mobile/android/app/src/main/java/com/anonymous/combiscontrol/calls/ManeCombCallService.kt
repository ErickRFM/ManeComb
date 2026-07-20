package com.anonymous.combiscontrol.calls

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R

/**
 * Mantiene viva la captura de microfono/camara mientras hay una llamada activa.
 *
 * Desde Android 14 declarar los permisos FOREGROUND_SERVICE_MICROPHONE/CAMERA no
 * basta: el sistema corta la captura si la app pasa a segundo plano sin un
 * foreground service del tipo correspondiente. react-native-webrtc no arranca
 * ninguno por su cuenta.
 */
class ManeCombCallService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val isVideo = intent?.getBooleanExtra(EXTRA_IS_VIDEO, false) ?: false
    ensureChannel()
    val notification = buildNotification(isVideo)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, resolveServiceType(isVideo))
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }

    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Llamadas", NotificationManager.IMPORTANCE_LOW)
    )
  }

  private fun buildNotification(isVideo: Boolean) =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle(if (isVideo) "Videollamada en curso" else "Llamada en curso")
      .setContentText("Toca para volver a la llamada")
      .setContentIntent(
        PendingIntent.getActivity(
          this,
          0,
          Intent(this, MainActivity::class.java),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
      )
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .build()

  /**
   * El manifest declara microphone|camera; aqui pedimos solo lo que la llamada
   * usa de verdad, porque Android 14 exige que el tipo coincida con la captura
   * activa y con el permiso concedido.
   */
  private fun resolveServiceType(isVideo: Boolean): Int {
    val microphone = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
    return if (isVideo) microphone or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA else microphone
  }

  companion object {
    const val EXTRA_IS_VIDEO = "isVideo"
    private const val CHANNEL_ID = "manecomb-call-ongoing"
    private const val NOTIFICATION_ID = 2403
  }
}
