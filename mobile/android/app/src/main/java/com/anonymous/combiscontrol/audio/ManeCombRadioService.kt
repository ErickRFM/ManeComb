package com.anonymous.combiscontrol.audio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R

/**
 * Contenedor foreground de Radio. No posee transporte ni audio: refleja el estado
 * real publicado por el runtime y declara el tipo de foreground service que
 * corresponde a ese estado (microfono solo mientras se transmite).
 */
class ManeCombRadioService : Service() {
  private var currentMode: String = MODE_LISTENING

  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Radio en vivo", NotificationManager.IMPORTANCE_LOW)
      )
    }
    promoteToForeground(MODE_LISTENING)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val requestedMode = intent?.getStringExtra(EXTRA_MODE)
    promoteToForeground(normalizeMode(requestedMode))
    // El servicio no puede reconstruir la sesion de Radio por si mismo: si el
    // proceso muere, el runtime lo vuelve a levantar al reactivarse. START_STICKY
    // solo dejaria una notificacion sin canal detras.
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun promoteToForeground(mode: String) {
    val effectiveMode = if (mode == MODE_TRANSMITTING && !hasMicrophonePermission()) {
      MODE_LISTENING
    } else {
      mode
    }
    currentMode = effectiveMode
    val notification = buildNotification(effectiveMode)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, foregroundServiceType(effectiveMode))
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun foregroundServiceType(mode: String): Int {
    if (mode != MODE_TRANSMITTING) return ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
    return ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or
      ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
  }

  private fun hasMicrophonePermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  private fun buildNotification(mode: String) =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.notification_icon)
      .setContentTitle("ManeComb Radio")
      .setContentText(
        if (mode == MODE_TRANSMITTING) "Transmitiendo en el canal" else "Escuchando el canal"
      )
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
      .build()

  companion object {
    private const val CHANNEL_ID = "manecomb-radio-live"
    private const val NOTIFICATION_ID = 2402
    const val EXTRA_MODE = "com.anonymous.combiscontrol.audio.RADIO_MODE"
    const val MODE_LISTENING = "listening"
    const val MODE_TRANSMITTING = "transmitting"

    fun normalizeMode(mode: String?): String =
      if (mode == MODE_TRANSMITTING) MODE_TRANSMITTING else MODE_LISTENING

    fun intentFor(context: Context, mode: String?): Intent =
      Intent(context, ManeCombRadioService::class.java).putExtra(EXTRA_MODE, normalizeMode(mode))
  }
}
