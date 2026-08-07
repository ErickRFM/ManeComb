package com.anonymous.combiscontrol.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.os.Build
import android.util.Base64
import android.util.Log
import kotlin.concurrent.thread
import kotlin.math.abs
import kotlin.math.max

/**
 * Unico pipeline de audio PTT del proceso: una AudioRecord para transmitir y una
 * AudioTrack para recibir. Se movio aqui desde ManeCombAudioModule para que el
 * camino critico del audio deje de depender del bridge de React Native.
 *
 * La captura entrega frames directamente al controlador de sesion, que los emite
 * por el socket nativo. React ya no ve un solo frame PCM.
 */
class RadioAudioSession private constructor(
  private val context: Context
) : RadioAudioEngine {

  interface Listener {
    /** Frame PCM16 de 20 ms listo para transmitir. Se invoca en el hilo de captura. */
    fun onFrameCaptured(base64Data: String, sequence: Int, capturedAt: Long)

    /** Nivel suavizado para la UI. Publicado muy por debajo de la cadencia de audio. */
    fun onAudioLevel(level: Double)

    /** Fallo de captura o reproduccion. La sesion ya libero el recurso afectado. */
    fun onAudioFailure(code: String)
  }

  private val audioRoute = RadioAudioRoute.shared(context)
  private var listener: Listener? = null

  @Volatile private var capturing = false
  private var recorder: AudioRecord? = null
  private var captureThread: Thread? = null
  private var captureSequence = 0

  private var track: AudioTrack? = null
  private var playbackTransmissionId: String? = null
  private var playbackFocusRequest: AudioFocusRequest? = null
  @Volatile private var playbackFocusLost = false
  private val rxPolicy = RadioRxQueuePolicy()

  private var lastLevelPublishedAt = 0L

  private val playbackFocusListener = AudioManager.OnAudioFocusChangeListener { change ->
    when (change) {
      AudioManager.AUDIOFOCUS_LOSS,
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> {
        playbackFocusLost = true
        stopPlayback(preserveFocusLoss = true)
        listener?.onAudioFailure("ptt_audio_focus_lost")
      }
      AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK ->
        runCatching { track?.setVolume(0.2f) }
      AudioManager.AUDIOFOCUS_GAIN ->
        runCatching { track?.setVolume(1.0f) }
    }
  }

  fun setListener(listener: Listener?) {
    this.listener = listener
  }

  fun isCapturing(): Boolean = capturing

  fun isPlaying(): Boolean = track != null

  /** True cuando el canal esta ocupando el audio y el historial no debe sonar. */
  fun ownsAudio(): Boolean = capturing || track != null

  // ---------------- Arbitraje del microfono ----------------
  //
  // El microfono es un recurso exclusivo del proceso: la grabacion de notas de
  // voz de Chat (MediaRecorder) y la captura PTT (AudioRecord) no pueden
  // coexistir. Esta sesion es la autoridad, porque ya sabe quien posee el audio.

  @Volatile private var externalCaptureActive = false

  /**
   * Reserva el microfono para un consumidor ajeno a Radio (notas de voz).
   * @return false si Radio ya posee el audio.
   */
  @Synchronized
  fun beginExternalCapture(): Boolean {
    if (ownsAudio()) return false
    externalCaptureActive = true
    return true
  }

  @Synchronized
  fun endExternalCapture() {
    externalCaptureActive = false
  }

  fun isExternalCaptureActive(): Boolean = externalCaptureActive

  // ---------------- Transmision ----------------

  @Synchronized
  override fun startCapture(): Boolean {
    if (capturing) return true

    // Otro consumidor tiene el microfono: transmitir ahora produciria un fallo
    // de AudioRecord o robaria la grabacion en curso.
    if (externalCaptureActive) {
      RadioLog.warn("capture_blocked", "reason" to "microphone_busy")
      listener?.onAudioFailure("microphone_busy")
      return false
    }

    val minBuffer = AudioRecord.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_IN_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val audioRecord = try {
      AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        SAMPLE_RATE,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        max(minBuffer, FRAME_BYTES * 4)
      )
    } catch (error: Exception) {
      Log.e(TAG, "AudioRecord creation failed", error)
      listener?.onAudioFailure("ptt_capture_start_failed")
      return false
    }

    if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
      audioRecord.release()
      listener?.onAudioFailure("ptt_capture_init_failed")
      return false
    }

    // Transmitir y reproducir no pueden coexistir en un canal semiduplex.
    stopPlayback()
    recorder = audioRecord
    captureSequence = 0
    capturing = true

    return try {
      audioRecord.startRecording()
      if (audioRecord.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("AudioRecord did not start")
      }
      captureThread = thread(name = "ManeCombRadioCapture", start = true) { captureLoop(audioRecord) }
      true
    } catch (error: Exception) {
      Log.e(TAG, "AudioRecord start failed", error)
      stopCapture()
      listener?.onAudioFailure("ptt_capture_start_failed")
      false
    }
  }

  private fun captureLoop(audioRecord: AudioRecord) {
    val frame = ByteArray(FRAME_BYTES)
    var offset = 0
    var failed = false

    try {
      while (capturing) {
        val read = audioRecord.read(frame, offset, frame.size - offset, AudioRecord.READ_BLOCKING)
        if (read > 0) {
          offset += read
          if (offset < frame.size) continue
          if (!capturing) break
          val encoded = Base64.encodeToString(frame, Base64.NO_WRAP)
          listener?.onFrameCaptured(encoded, captureSequence, System.currentTimeMillis())
          publishLevel(peakOf(frame))
          captureSequence += 1
          offset = 0
        } else if (read < 0) {
          failed = true
          break
        }
      }
    } catch (error: Exception) {
      if (capturing) failed = true
    }

    if (failed) {
      stopCapture()
      listener?.onAudioFailure("ptt_capture_read_failed")
    }
  }

  @Synchronized
  override fun stopCapture() {
    capturing = false
    runCatching { recorder?.stop() }
    if (captureThread !== Thread.currentThread()) {
      runCatching { captureThread?.join(500) }
    }
    captureThread = null
    runCatching { recorder?.release() }
    recorder = null
    captureSequence = 0
    publishLevel(0.0, force = true)
  }

  // ---------------- Recepcion ----------------

  @Synchronized
  override fun startPlayback(transmissionId: String): Boolean {
    if (capturing) return false
    if (playbackFocusLost) {
      listener?.onAudioFailure("ptt_audio_focus_lost")
      return false
    }

    if (track != null && playbackTransmissionId == transmissionId) return true
    stopPlayback()

    if (!requestPlaybackFocus()) {
      listener?.onAudioFailure("ptt_audio_focus_denied")
      return false
    }

    val minBuffer = AudioTrack.getMinBufferSize(
      SAMPLE_RATE,
      AudioFormat.CHANNEL_OUT_MONO,
      AudioFormat.ENCODING_PCM_16BIT
    )
    val next = try {
      AudioTrack.Builder()
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setAudioFormat(
          AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(SAMPLE_RATE)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        )
        .setBufferSizeInBytes(max(minBuffer, FRAME_BYTES * 8))
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()
    } catch (error: Exception) {
      abandonPlaybackFocus()
      listener?.onAudioFailure("ptt_playback_start_failed")
      return false
    }

    if (next.state != AudioTrack.STATE_INITIALIZED) {
      next.release()
      abandonPlaybackFocus()
      listener?.onAudioFailure("ptt_playback_start_failed")
      return false
    }

    audioRoute.applyTo(next)
    next.play()
    track = next
    playbackTransmissionId = transmissionId
    rxPolicy.begin(transmissionId)
    return true
  }

  /** @return true si el frame llego a la salida de audio. */
  override fun enqueueFrame(transmissionId: String, sequence: Int, base64Data: String): Boolean {
    val current = track ?: return false
    if (playbackTransmissionId != transmissionId) return false

    val decision = rxPolicy.admit(transmissionId, sequence)
    if (decision == RadioRxQueuePolicy.Decision.DROP_DUPLICATE ||
      decision == RadioRxQueuePolicy.Decision.DROP_FOREIGN ||
      decision == RadioRxQueuePolicy.Decision.DROP_OVERFLOW
    ) {
      return false
    }

    val bytes = try {
      Base64.decode(base64Data, Base64.NO_WRAP)
    } catch (error: IllegalArgumentException) {
      return false
    }
    if (bytes.size != FRAME_BYTES) return false

    return try {
      val written = current.write(bytes, 0, bytes.size, AudioTrack.WRITE_BLOCKING)
      rxPolicy.onFrameRendered()
      if (written == bytes.size) {
        publishLevel(peakOf(bytes))
        true
      } else {
        false
      }
    } catch (error: Exception) {
      Log.w(TAG, "AudioTrack write failed", error)
      false
    }
  }

  override fun stopPlayback() = stopPlayback(preserveFocusLoss = false)

  @Synchronized
  fun stopPlayback(preserveFocusLoss: Boolean) {
    val current = track
    track = null
    playbackTransmissionId = null
    rxPolicy.reset()
    if (current != null) {
      runCatching { current.pause() }
      runCatching { current.flush() }
      runCatching { current.stop() }
      runCatching { current.release() }
    }
    abandonPlaybackFocus()
    if (!preserveFocusLoss) playbackFocusLost = false
    publishLevel(0.0, force = true)
  }

  /** Libera micro y salida sin destruir la sesion: llamada entrante, pausa, logout. */
  override fun releaseAudio() {
    stopCapture()
    stopPlayback()
  }

  fun applyAudioRoute() {
    track?.let(audioRoute::applyTo)
  }

  // ---------------- Metering ----------------

  private fun peakOf(bytes: ByteArray): Double {
    var peak = 0
    var index = 0
    while (index + 1 < bytes.size) {
      val sample = ((bytes[index + 1].toInt() shl 8) or (bytes[index].toInt() and 0xff)).toShort().toInt()
      peak = max(peak, abs(sample))
      index += 2
    }
    return (peak / 32768.0).coerceIn(0.0, 1.0)
  }

  /**
   * El metering es informacion de UI y no puede marcar el ritmo de React: se
   * publica como maximo cada LEVEL_INTERVAL_MS (~12 Hz) en lugar de a los 50 Hz
   * del audio.
   */
  private fun publishLevel(level: Double, force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastLevelPublishedAt < LEVEL_INTERVAL_MS) return
    lastLevelPublishedAt = now
    listener?.onAudioLevel(level)
  }

  // ---------------- Audio focus ----------------

  private fun requestPlaybackFocus(): Boolean {
    val audioManager = context.getSystemService(AudioManager::class.java) ?: return true
    val result = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .setOnAudioFocusChangeListener(playbackFocusListener)
        .build()
      playbackFocusRequest = request
      audioManager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      audioManager.requestAudioFocus(
        playbackFocusListener,
        AudioManager.STREAM_MUSIC,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
      )
    }
    val granted = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    if (!granted) playbackFocusRequest = null
    return granted
  }

  private fun abandonPlaybackFocus() {
    val audioManager = context.getSystemService(AudioManager::class.java) ?: return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      playbackFocusRequest?.let(audioManager::abandonAudioFocusRequest)
      playbackFocusRequest = null
    } else {
      @Suppress("DEPRECATION")
      audioManager.abandonAudioFocus(playbackFocusListener)
    }
  }

  companion object {
    private const val TAG = "ManeCombRadioAudio"
    const val SAMPLE_RATE = 16000
    const val FRAME_DURATION_MS = 20

    /** 20 ms de PCM16 mono a 16 kHz. Contrato vigente con el backend. */
    const val FRAME_BYTES = 640

    private const val LEVEL_INTERVAL_MS = 80L

    @Volatile private var instance: RadioAudioSession? = null

    /** Una sola sesion de audio PTT por proceso. */
    fun shared(context: Context): RadioAudioSession =
      instance ?: synchronized(this) {
        instance ?: RadioAudioSession(context.applicationContext).also { instance = it }
      }
  }
}
