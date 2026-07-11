package com.anonymous.combiscontrol.audio

import android.media.AudioFocusRequest
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.content.Intent
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.util.Log
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.FileOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.Locale
import kotlin.math.log10
import kotlin.math.max
import kotlin.concurrent.thread

class ManeCombAudioModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private var recorder: MediaRecorder? = null
  private var recordingFile: File? = null
  private var recordingStartedAt: Long = 0

  private var player: MediaPlayer? = null
  private var playerUri: String? = null
  private var playerLocalUri: String? = null
  private var playerPrepared = false
  private var audioFocusRequest: AudioFocusRequest? = null
  @Volatile private var pttCapturing = false
  private var pttRecorder: AudioRecord? = null
  private var pttCaptureThread: Thread? = null
  private var pttTrack: AudioTrack? = null

  private fun emitPttEvent(name: String, payload: com.facebook.react.bridge.WritableMap) {
    if (reactContext.hasActiveReactInstance()) {
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit(name, payload)
    }
  }

  @ReactMethod
  fun startPttCapture(promise: Promise) {
    if (pttCapturing) {
      promise.reject("ptt_capture_active", "La captura PTT ya esta activa.")
      return
    }

    try {
      val sampleRate = 16000
      val frameSamples = 320 // 20 ms, mono PCM16.
      val minBuffer = AudioRecord.getMinBufferSize(
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT
      )
      val bufferSize = max(minBuffer, frameSamples * 2 * 4)
      val audioRecord = AudioRecord(
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        sampleRate,
        AudioFormat.CHANNEL_IN_MONO,
        AudioFormat.ENCODING_PCM_16BIT,
        bufferSize
      )

      if (audioRecord.state != AudioRecord.STATE_INITIALIZED) {
        audioRecord.release()
        promise.reject("ptt_capture_init_failed", "Android no pudo inicializar AudioRecord.")
        return
      }

      stopPlayerInternal()
      pttRecorder = audioRecord
      pttCapturing = true
      audioRecord.startRecording()
      pttCaptureThread = thread(name = "ManeCombPttCapture", start = true) {
        val frame = ByteArray(frameSamples * 2)
        while (pttCapturing) {
          val bytesRead = audioRecord.read(frame, 0, frame.size, AudioRecord.READ_BLOCKING)
          if (bytesRead > 0) {
            val encoded = Base64.encodeToString(frame, 0, bytesRead, Base64.NO_WRAP)
            emitPttEvent("ManeCombPttFrame", Arguments.createMap().apply {
              putString("data", encoded)
              putInt("bytes", bytesRead)
              putDouble("capturedAt", System.currentTimeMillis().toDouble())
            })
          } else if (bytesRead < 0) {
            emitPttEvent("ManeCombPttError", Arguments.createMap().apply {
              putString("code", "ptt_capture_read_failed")
              putInt("nativeCode", bytesRead)
            })
            break
          }
        }
      }
      promise.resolve(Arguments.createMap().apply {
        putInt("sampleRate", sampleRate)
        putInt("frameDurationMs", 20)
      })
    } catch (error: Exception) {
      stopPttCaptureInternal()
      promise.reject("ptt_capture_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopPttCapture(promise: Promise) {
    stopPttCaptureInternal()
    promise.resolve(null)
  }

  private fun stopPttCaptureInternal() {
    pttCapturing = false
    try { pttRecorder?.stop() } catch (_: Exception) {}
    try { pttCaptureThread?.join(500) } catch (_: InterruptedException) {}
    pttCaptureThread = null
    pttRecorder?.release()
    pttRecorder = null
  }

  @ReactMethod
  fun startPttPlayback(promise: Promise) {
    try {
      if (pttTrack == null) {
        val sampleRate = 16000
        val minBuffer = AudioTrack.getMinBufferSize(
          sampleRate,
          AudioFormat.CHANNEL_OUT_MONO,
          AudioFormat.ENCODING_PCM_16BIT
        )
        pttTrack = AudioTrack.Builder()
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(sampleRate)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build()
          )
          .setBufferSizeInBytes(max(minBuffer, 640 * 8))
          .setTransferMode(AudioTrack.MODE_STREAM)
          .build()
      }
      if (pttTrack?.playState != AudioTrack.PLAYSTATE_PLAYING) pttTrack?.play()
      promise.resolve(null)
    } catch (error: Exception) {
      stopPttPlaybackInternal()
      promise.reject("ptt_playback_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun enqueuePttFrame(base64Data: String, promise: Promise) {
    val track = pttTrack
    if (track == null) {
      promise.reject("ptt_playback_inactive", "La reproduccion PTT no esta activa.")
      return
    }
    try {
      val bytes = Base64.decode(base64Data, Base64.NO_WRAP)
      val written = track.write(bytes, 0, bytes.size, AudioTrack.WRITE_NON_BLOCKING)
      var peak = 0
      var index = 0
      while (index + 1 < bytes.size) {
        val sample = ((bytes[index + 1].toInt() shl 8) or (bytes[index].toInt() and 0xff)).toShort().toInt()
        peak = max(peak, kotlin.math.abs(sample))
        index += 2
      }
      emitPttEvent("ManeCombPttLevel", Arguments.createMap().apply {
        putDouble("level", (peak / 32768.0).coerceIn(0.0, 1.0))
      })
      promise.resolve(written)
    } catch (error: Exception) {
      promise.reject("ptt_playback_write_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopPttPlayback(promise: Promise) {
    stopPttPlaybackInternal()
    promise.resolve(null)
  }

  private fun stopPttPlaybackInternal() {
    try { pttTrack?.pause() } catch (_: Exception) {}
    try { pttTrack?.flush() } catch (_: Exception) {}
    try { pttTrack?.stop() } catch (_: Exception) {}
    pttTrack?.release()
    pttTrack = null
  }

  @ReactMethod fun addListener(eventName: String) = Unit
  @ReactMethod fun removeListeners(count: Int) = Unit

  @ReactMethod
  fun startRadioForegroundService(promise: Promise) {
    try {
      val intent = Intent(reactContext, ManeCombRadioService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) reactContext.startForegroundService(intent)
      else reactContext.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("radio_service_start_failed", error.message, error)
    }
  }

  @ReactMethod
  fun stopRadioForegroundService(promise: Promise) {
    reactContext.stopService(Intent(reactContext, ManeCombRadioService::class.java))
    promise.resolve(null)
  }

  override fun getName(): String = "ManeCombAudio"

  @ReactMethod
  fun startRecording(options: ReadableMap?, promise: Promise) {
    try {
      if (recorder != null) {
        promise.reject("recording_in_progress", "Ya hay una grabacion activa.")
        return
      }

      stopPlayerInternal()

      val audioDir = File(reactContext.cacheDir, "manecomb-audio")
      if (!audioDir.exists()) {
        audioDir.mkdirs()
      }

      val outputFile = File(audioDir, "radio-note-${System.currentTimeMillis()}.m4a")
      val nextRecorder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          MediaRecorder(reactContext)
        } else {
          @Suppress("DEPRECATION")
          MediaRecorder()
        }

      nextRecorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      nextRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      nextRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      nextRecorder.setAudioSamplingRate(44100)
      nextRecorder.setAudioEncodingBitRate(96000)
      nextRecorder.setOutputFile(outputFile.absolutePath)
      nextRecorder.prepare()
      nextRecorder.start()

      recorder = nextRecorder
      recordingFile = outputFile
      recordingStartedAt = System.currentTimeMillis()

      promise.resolve(recordingStatusMap())
    } catch (error: Exception) {
      releaseRecorder()
      promise.reject("recording_start_failed", error.message ?: "No fue posible iniciar la grabacion.", error)
    }
  }

  @ReactMethod
  fun stopRecording(promise: Promise) {
    val activeRecorder = recorder
    val activeFile = recordingFile

    if (activeRecorder == null || activeFile == null) {
      promise.resolve(recordingStatusMap())
      return
    }

    try {
      activeRecorder.stop()
    } catch (error: RuntimeException) {
      activeFile.delete()
      releaseRecorder()
      promise.reject("recording_too_short", "La grabacion fue demasiado corta.", error)
      return
    } catch (error: Exception) {
      activeFile.delete()
      releaseRecorder()
      promise.reject("recording_stop_failed", error.message ?: "No fue posible detener la grabacion.", error)
      return
    }

    val durationMillis = max(0, System.currentTimeMillis() - recordingStartedAt)
    releaseRecorder(keepFile = true)

    if (!activeFile.exists() || activeFile.length() <= 0) {
      activeFile.delete()
      promise.reject("recording_empty", "No se genero audio grabado.")
      return
    }

    promise.resolve(
      Arguments.createMap().apply {
        putBoolean("isRecording", false)
        putDouble("durationMillis", durationMillis.toDouble())
        putString("url", Uri.fromFile(activeFile).toString())
        putString("uri", Uri.fromFile(activeFile).toString())
        putString("mimeType", "audio/mp4")
        putDouble("size", activeFile.length().toDouble())
        putDouble("metering", -60.0)
      }
    )
  }

  @ReactMethod
  fun getRecordingStatus(promise: Promise) {
    promise.resolve(recordingStatusMap())
  }

  @ReactMethod
  fun startPlayer(source: ReadableMap, promise: Promise) {
    val uri = source.getString("uri")

    if (uri.isNullOrBlank()) {
      promise.reject("audio_url_missing", "URL de audio invalida.")
      return
    }

    try {
      stopPlayerInternal()
      val headers = extractHeaders(source)
      val playbackSource = resolvePlaybackSource(uri, headers)

      Log.i(
        TAG,
        "startPlayer source=${playbackSource.sourceUri} local=${playbackSource.localUri} status=${playbackSource.statusCode} contentType=${playbackSource.contentType} size=${playbackSource.size}"
      )

      if (!requestPlaybackFocus()) {
        promise.reject("audio_focus_denied", "Android no concedio Audio Focus para reproducir.")
        return
      }

      val nextPlayer = MediaPlayer()
      nextPlayer.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )

      nextPlayer.setDataSource(reactContext, Uri.parse(playbackSource.localUri))

      player = nextPlayer
      playerUri = uri
      playerLocalUri = playbackSource.localUri
      playerPrepared = false

      nextPlayer.setOnPreparedListener {
        playerPrepared = true
        Log.i(TAG, "player prepared source=$uri duration=${it.duration}")
        it.start()
        promise.resolve(playerStatusMap())
      }
      nextPlayer.setOnCompletionListener {
        playerPrepared = true
        abandonPlaybackFocus()
      }
      nextPlayer.setOnErrorListener { _, what, extra ->
        Log.e(TAG, "player error source=$uri what=$what extra=$extra")
        stopPlayerInternal()
        if (!playerPrepared) {
          promise.reject("audio_playback_failed", "Error del reproductor Android ($what/$extra).")
        }
        true
      }
      nextPlayer.prepareAsync()
    } catch (error: AudioPlaybackException) {
      stopPlayerInternal()
      Log.e(TAG, "playback failed code=${error.code} url=$uri message=${error.message}", error)
      promise.reject(error.code, error.message ?: "No fue posible reproducir el audio.", error)
    } catch (error: Exception) {
      stopPlayerInternal()
      Log.e(TAG, "playback failed url=$uri message=${error.message}", error)
      promise.reject("audio_playback_failed", error.message ?: "Error del reproductor Android.", error)
    }
  }

  @ReactMethod
  fun pausePlayer(promise: Promise) {
    try {
      player?.takeIf { playerPrepared && it.isPlaying }?.pause()
      promise.resolve(playerStatusMap())
    } catch (error: Exception) {
      promise.reject("audio_pause_failed", error.message ?: "No fue posible pausar el audio.", error)
    }
  }

  @ReactMethod
  fun stopPlayer(promise: Promise) {
    stopPlayerInternal()
    promise.resolve(playerStatusMap())
  }

  @ReactMethod
  fun seekTo(positionMillis: Double, promise: Promise) {
    try {
      val safePosition = max(0, positionMillis.toInt())
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        player?.takeIf { playerPrepared }?.seekTo(safePosition.toLong(), MediaPlayer.SEEK_CLOSEST)
      } else {
        @Suppress("DEPRECATION")
        player?.takeIf { playerPrepared }?.seekTo(safePosition)
      }
      promise.resolve(playerStatusMap())
    } catch (error: Exception) {
      promise.reject("audio_seek_failed", error.message ?: "No fue posible mover el audio.", error)
    }
  }

  @ReactMethod
  fun getPlayerStatus(promise: Promise) {
    promise.resolve(playerStatusMap())
  }

  override fun invalidate() {
    releaseRecorder()
    stopPlayerInternal()
    super.invalidate()
  }

  private fun recordingStatusMap() =
    Arguments.createMap().apply {
      val activeRecorder = recorder
      val activeFile = recordingFile
      val durationMillis =
        if (activeRecorder != null && recordingStartedAt > 0) {
          max(0, System.currentTimeMillis() - recordingStartedAt)
        } else {
          0
        }

      putBoolean("isRecording", activeRecorder != null)
      putDouble("durationMillis", durationMillis.toDouble())
      putString("url", activeFile?.let { Uri.fromFile(it).toString() })
      putString("uri", activeFile?.let { Uri.fromFile(it).toString() })
      putString("mimeType", "audio/mp4")
      putDouble("metering", readMetering(activeRecorder))
      putDouble("size", activeFile?.length()?.toDouble() ?: 0.0)
    }

  private fun playerStatusMap() =
    Arguments.createMap().apply {
      val activePlayer = player
      val duration =
        try {
          if (activePlayer != null && playerPrepared) activePlayer.duration else 0
        } catch (_: Exception) {
          0
        }
      val currentPosition =
        try {
          if (activePlayer != null && playerPrepared) activePlayer.currentPosition else 0
        } catch (_: Exception) {
          0
        }
      val isPlaying =
        try {
          activePlayer?.isPlaying == true
        } catch (_: Exception) {
          false
        }

      putBoolean("isLoaded", activePlayer != null && playerPrepared)
      putBoolean("isBuffering", activePlayer != null && !playerPrepared)
      putBoolean("playing", isPlaying)
      putDouble("currentTime", currentPosition / 1000.0)
      putDouble("duration", duration / 1000.0)
      putDouble("currentMillis", currentPosition.toDouble())
      putDouble("durationMillis", duration.toDouble())
      putString("uri", playerUri)
      putString("localUri", playerLocalUri)
    }

  private fun extractHeaders(source: ReadableMap): HashMap<String, String> {
    val headers = HashMap<String, String>()

    if (source.hasKey("headers") && !source.isNull("headers")) {
      val headerMap = source.getMap("headers")
      val iterator = headerMap?.keySetIterator()
      while (iterator?.hasNextKey() == true) {
        val key = iterator.nextKey()
        headers[key] = headerMap.getString(key) ?: ""
      }
    }

    return headers
  }

  private fun resolvePlaybackSource(uri: String, headers: HashMap<String, String>): PlaybackSource {
    val normalizedUri = uri.trim()

    if (!normalizedUri.startsWith("http://", ignoreCase = true) &&
      !normalizedUri.startsWith("https://", ignoreCase = true)
    ) {
      val parsedUri = Uri.parse(normalizedUri)
      if (parsedUri.scheme == "file") {
        val file = File(parsedUri.path ?: "")

        if (!file.exists()) {
          throw AudioPlaybackException("audio_file_missing", "Archivo no encontrado en el dispositivo.")
        }

        if (file.length() <= 0) {
          throw AudioPlaybackException("audio_file_empty", "El archivo descargado esta vacio.")
        }

        return PlaybackSource(normalizedUri, normalizedUri, guessMimeType(file.name), file.length(), 0)
      }

      return PlaybackSource(normalizedUri, normalizedUri, "", 0, 0)
    }

    val cacheDir = File(reactContext.cacheDir, "manecomb-audio-playback")
    if (!cacheDir.exists()) {
      cacheDir.mkdirs()
    }

    val connection = (URL(normalizedUri).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 15000
      readTimeout = 30000
      requestMethod = "GET"
      setRequestProperty("Accept", "audio/*,*/*;q=0.8")
      headers.forEach { (key, value) ->
        if (key.isNotBlank() && value.isNotBlank()) {
          setRequestProperty(key, value)
        }
      }
    }

    try {
      val statusCode = connection.responseCode
      val contentType = connection.contentType.orEmpty().lowercase(Locale.US)
      Log.i(
        TAG,
        "download audio url=$normalizedUri status=$statusCode contentType=$contentType length=${connection.contentLengthLong}"
      )

      when (statusCode) {
        HttpURLConnection.HTTP_UNAUTHORIZED,
        HttpURLConnection.HTTP_FORBIDDEN -> throw AudioPlaybackException(
          "audio_download_auth",
          "No tienes autorizacion para descargar este audio."
        )
        HttpURLConnection.HTTP_NOT_FOUND -> throw AudioPlaybackException(
          "audio_download_not_found",
          "Archivo no encontrado."
        )
      }

      if (statusCode !in 200..299) {
        throw AudioPlaybackException(
          "audio_download_http",
          "Error de descarga: HTTP $statusCode."
        )
      }

      if (!isSupportedAudioContentType(contentType)) {
        throw AudioPlaybackException(
          "audio_unsupported_format",
          "Formato no soportado: ${contentType.ifBlank { "desconocido" }}."
        )
      }

      val targetFile = File(cacheDir, "${sha256(normalizedUri)}${extensionForContentType(contentType, normalizedUri)}")
      val temporaryFile = File(cacheDir, "${targetFile.name}.tmp")

      connection.inputStream.use { input ->
        FileOutputStream(temporaryFile).use { output ->
          input.copyTo(output)
        }
      }

      if (!temporaryFile.exists() || temporaryFile.length() <= 0) {
        temporaryFile.delete()
        throw AudioPlaybackException("audio_download_empty", "Error de descarga: archivo vacio.")
      }

      if (targetFile.exists()) {
        targetFile.delete()
      }

      if (!temporaryFile.renameTo(targetFile)) {
        temporaryFile.copyTo(targetFile, overwrite = true)
        temporaryFile.delete()
      }

      Log.i(TAG, "audio cached local=${targetFile.absolutePath} size=${targetFile.length()}")

      return PlaybackSource(
        sourceUri = normalizedUri,
        localUri = Uri.fromFile(targetFile).toString(),
        contentType = contentType,
        size = targetFile.length(),
        statusCode = statusCode
      )
    } finally {
      connection.disconnect()
    }
  }

  private fun isSupportedAudioContentType(contentType: String): Boolean {
    if (contentType.isBlank()) {
      return true
    }

    return contentType.startsWith("audio/") ||
      contentType.contains("octet-stream") ||
      contentType.contains("mpeg") ||
      contentType.contains("mp4")
  }

  private fun extensionForContentType(contentType: String, uri: String): String {
    val lowerUri = uri.lowercase(Locale.US).substringBefore("?")

    listOf(".mp3", ".m4a", ".mp4", ".aac", ".wav", ".ogg", ".webm").firstOrNull {
      lowerUri.endsWith(it)
    }?.let {
      return it
    }

    return when {
      contentType.contains("mpeg") || contentType.contains("mp3") -> ".mp3"
      contentType.contains("aac") -> ".aac"
      contentType.contains("wav") -> ".wav"
      contentType.contains("ogg") -> ".ogg"
      contentType.contains("webm") -> ".webm"
      else -> ".m4a"
    }
  }

  private fun guessMimeType(fileName: String): String =
    when (fileName.lowercase(Locale.US).substringAfterLast(".", "")) {
      "mp3" -> "audio/mpeg"
      "aac" -> "audio/aac"
      "wav" -> "audio/wav"
      "ogg" -> "audio/ogg"
      "webm" -> "audio/webm"
      else -> "audio/mp4"
    }

  private fun sha256(value: String): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }
  }

  private fun requestPlaybackFocus(): Boolean {
    val audioManager = reactContext.getSystemService(AudioManager::class.java) ?: return true
    val result =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
              .build()
          )
          .build()
        audioFocusRequest = request
        audioManager.requestAudioFocus(request)
      } else {
        @Suppress("DEPRECATION")
        audioManager.requestAudioFocus(
          null,
          AudioManager.STREAM_MUSIC,
          AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
        )
      }

    return result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
  }

  private fun abandonPlaybackFocus() {
    val audioManager = reactContext.getSystemService(AudioManager::class.java) ?: return

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      audioFocusRequest?.let {
        audioManager.abandonAudioFocusRequest(it)
      }
      audioFocusRequest = null
      return
    }

    @Suppress("DEPRECATION")
    audioManager.abandonAudioFocus(null)
  }

  private fun readMetering(activeRecorder: MediaRecorder?): Double {
    if (activeRecorder == null) {
      return -60.0
    }

    return try {
      val amplitude = activeRecorder.maxAmplitude
      if (amplitude <= 0) {
        -60.0
      } else {
        (20.0 * log10(amplitude / 32767.0)).coerceIn(-60.0, 0.0)
      }
    } catch (_: Exception) {
      -60.0
    }
  }

  private fun releaseRecorder(keepFile: Boolean = false) {
    try {
      recorder?.release()
    } catch (_: Exception) {
      // Recorder may already be released by Android after a failed stop.
    }

    if (!keepFile) {
      recordingFile?.delete()
    }

    recorder = null
    recordingFile = null
    recordingStartedAt = 0
  }

  private fun stopPlayerInternal() {
    try {
      player?.stop()
    } catch (_: Exception) {
      // Player may not be prepared yet.
    }

    try {
      player?.release()
    } catch (_: Exception) {
      // Ignore release errors.
    }

    player = null
    playerUri = null
    playerLocalUri = null
    playerPrepared = false
    abandonPlaybackFocus()
  }

  private data class PlaybackSource(
    val sourceUri: String,
    val localUri: String,
    val contentType: String,
    val size: Long,
    val statusCode: Int
  )

  private class AudioPlaybackException(
    val code: String,
    message: String
  ) : Exception(message)

  companion object {
    private const val TAG = "ManeCombAudio"
  }
}
