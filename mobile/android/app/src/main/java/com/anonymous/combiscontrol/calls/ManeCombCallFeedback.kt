package com.anonymous.combiscontrol.calls

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.anonymous.combiscontrol.notifications.ManeCombPushNotificationRenderer

/**
 * Autoridad unica de feedback audible/haptico mientras React controla una llamada.
 *
 * Background/cold-start sigue perteneciendo a NotificationChannel + CallStyle. Cuando
 * la superficie de llamada ya esta viva, este objeto completa los dos huecos que el
 * canal por si solo no cubre de forma continua:
 * - timbre entrante sostenido con la app visible;
 * - ringback local para quien esta llamando.
 *
 * No toca WebRTC, signaling ni la ruta de audio de una llamada conectada. Al salir de
 * ringing todo se detiene antes de que arranque/continue la media RTC.
 */
object ManeCombCallFeedback {
  const val MODE_NONE = "none"
  const val MODE_INCOMING = "incoming"
  const val MODE_RINGBACK = "ringback"

  private val handler = Handler(Looper.getMainLooper())
  private val defaultIncomingVibration = longArrayOf(0, 700, 350, 700, 350, 900)

  private var incomingCallId: String? = null
  private var incomingRingtone: Ringtone? = null
  private var incomingVibrator: Vibrator? = null
  private var pendingIncomingStart: Runnable? = null
  private var ringbackTone: ToneGenerator? = null

  @Synchronized
  fun setMode(context: Context, mode: String, callId: String? = null): Boolean {
    return when (mode.trim().lowercase()) {
      MODE_NONE -> {
        stopAllLocked()
        true
      }
      MODE_INCOMING -> startIncomingLocked(context.applicationContext, callId)
      MODE_RINGBACK -> startRingbackLocked()
      else -> false
    }
  }

  @Synchronized
  fun stopAll() {
    stopAllLocked()
  }

  private fun startIncomingLocked(context: Context, rawCallId: String?): Boolean {
    val callId = rawCallId.orEmpty().trim()
    if (callId.isEmpty()) return false

    stopRingbackLocked()
    if (incomingCallId == callId && (pendingIncomingStart != null || incomingRingtone?.isPlaying == true)) {
      return true
    }

    stopIncomingLocked()
    incomingCallId = callId

    // Si MainActivity acaba de abrirse desde CallStyle, deja terminar el primer
    // golpe del canal antes de iniciar el loop foreground. Asi no se superponen
    // dos timbres/vibraciones durante la transicion background -> full-screen.
    val delayMs = if (
      ManeCombPushNotificationRenderer.hasActiveIncomingCallNotification(context, callId)
    ) {
      1_200L
    } else {
      0L
    }

    val task = Runnable {
      synchronized(this@ManeCombCallFeedback) {
        if (incomingCallId != callId) return@synchronized
        pendingIncomingStart = null
        playIncomingLocked(context)
      }
    }
    pendingIncomingStart = task
    handler.postDelayed(task, delayMs)
    return true
  }

  private fun playIncomingLocked(context: Context) {
    ManeCombPushNotificationRenderer.ensureChannels(context)

    val notificationManager = context.getSystemService(NotificationManager::class.java)
    val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    if (audioManager?.ringerMode == AudioManager.RINGER_MODE_SILENT) return

    var soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
    var shouldVibrate = true
    var vibrationPattern = defaultIncomingVibration
    var canBypassDnd = false

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = notificationManager?.getNotificationChannel(
        ManeCombPushNotificationRenderer.CHANNEL_CALLS
      )
      if (channel != null) {
        if (channel.importance == NotificationManager.IMPORTANCE_NONE) return
        soundUri = channel.sound
        shouldVibrate = channel.shouldVibrate()
        vibrationPattern = channel.vibrationPattern?.takeIf { it.isNotEmpty() }
          ?: defaultIncomingVibration
        canBypassDnd = channel.canBypassDnd()
      }
    }

    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
      notificationManager != null &&
      notificationManager.currentInterruptionFilter != NotificationManager.INTERRUPTION_FILTER_ALL &&
      !canBypassDnd
    ) {
      return
    }

    if (audioManager?.ringerMode != AudioManager.RINGER_MODE_VIBRATE && soundUri != null) {
      runCatching {
        RingtoneManager.getRingtone(context, soundUri)?.also { ringtone ->
          ringtone.setAudioAttributes(
            AudioAttributes.Builder()
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .build()
          )
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.isLooping = true
          ringtone.play()
          incomingRingtone = ringtone
        }
      }
    }

    if (shouldVibrate) {
      val vibrator = resolveVibrator(context)
      if (vibrator?.hasVibrator() == true) {
        runCatching {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(vibrationPattern, 1))
          } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(vibrationPattern, 1)
          }
          incomingVibrator = vibrator
        }
      }
    }
  }

  private fun startRingbackLocked(): Boolean {
    stopIncomingLocked()
    if (ringbackTone != null) return true

    return try {
      // TONE_SUP_RINGTONE ya trae cadencia regional (CEPT/ANSI/Japan) y evita
      // empaquetar otro asset o meter un segundo reproductor de audio.
      val generator = ToneGenerator(AudioManager.STREAM_MUSIC, RINGBACK_VOLUME_PERCENT)
      if (!generator.startTone(ToneGenerator.TONE_SUP_RINGTONE)) {
        generator.release()
        false
      } else {
        ringbackTone = generator
        true
      }
    } catch (_: Exception) {
      false
    }
  }

  private fun stopAllLocked() {
    stopIncomingLocked()
    stopRingbackLocked()
  }

  private fun stopIncomingLocked() {
    pendingIncomingStart?.let(handler::removeCallbacks)
    pendingIncomingStart = null
    incomingCallId = null

    runCatching { incomingRingtone?.stop() }
    incomingRingtone = null

    runCatching { incomingVibrator?.cancel() }
    incomingVibrator = null
  }

  private fun stopRingbackLocked() {
    val tone = ringbackTone ?: return
    ringbackTone = null
    runCatching { tone.stopTone() }
    runCatching { tone.release() }
  }

  private fun resolveVibrator(context: Context): Vibrator? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }
  }

  private const val RINGBACK_VOLUME_PERCENT = 42
}
