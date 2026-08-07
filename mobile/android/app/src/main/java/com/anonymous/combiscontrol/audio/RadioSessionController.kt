package com.anonymous.combiscontrol.audio

/** Frontera de audio del controlador, para poder certificarlo sin Android. */
interface RadioAudioEngine {
  fun startCapture(): Boolean
  fun stopCapture()
  fun startPlayback(transmissionId: String): Boolean
  fun enqueueFrame(transmissionId: String, sequence: Int, base64Data: String): Boolean
  fun stopPlayback()
  fun releaseAudio()
}

/** Temporizador inyectable: los tests avanzan el tiempo sin esperar de verdad. */
interface RadioScheduler {
  fun postDelayed(delayMs: Long, action: () -> Unit): RadioCancellable
}

interface RadioCancellable {
  fun cancel()
}

/**
 * Duenio operativo de Radio en Android. Compone maquina de estados, transporte,
 * audio y reconexion; React Native no participa del camino critico.
 *
 * Todas las decisiones que Android puede tener que tomar con el runtime JS
 * suspendido viven aqui: unirse al canal, pedir el turno, cortar el microfono
 * cuando el backend revoca la transmision y volver a unirse tras reconectar.
 */
class RadioSessionController(
  private val transport: RadioTransport,
  private val audio: RadioAudioEngine,
  private val scheduler: RadioScheduler,
  private val reconnectPolicy: RadioReconnectPolicy = RadioReconnectPolicy(),
  private val clock: () -> Long = System::currentTimeMillis,
  private val onStateChanged: (RadioSessionState) -> Unit
) : RadioTransportListener {

  private var state = RadioSessionState()
  private var credentials: RadioSessionCredentials? = null
  private var pendingReconnect: RadioCancellable? = null
  private var active = false
  /** Generacion de sesion: descarta ACK y eventos de un canal ya abandonado. */
  private var generation = 0

  init {
    transport.setListener(this)
  }

  fun snapshot(): RadioSessionState = state

  // ---------------- Comandos ----------------

  fun activate(nextCredentials: RadioSessionCredentials, channelId: String) {
    if (!nextCredentials.isUsable || channelId.isBlank()) {
      deactivate()
      return
    }

    val sameSession = credentials == nextCredentials && state.channelId == channelId && active
    if (sameSession) return

    val credentialsChanged = credentials != nextCredentials
    credentials = nextCredentials
    active = true
    generation += 1
    cancelReconnect()

    if (credentialsChanged) {
      releaseChannel()
      dispatch(RadioEvent.Activate(channelId))
      reconnectPolicy.reset()
      transport.connect(nextCredentials)
      return
    }

    selectChannel(channelId)
  }

  fun selectChannel(channelId: String) {
    if (!active || channelId.isBlank()) return
    if (state.channelId == channelId && state.phase != RadioPhase.IDLE) return

    // Cambiar de canal cierra lo que estuviera en curso en el anterior antes de
    // pedir el nuevo: nunca quedan dos canales vivos.
    releaseChannel()
    generation += 1
    dispatch(RadioEvent.Activate(channelId))
    if (state.connected) joinCurrentChannel() else transport.connect(credentials ?: return)
  }

  fun deactivate() {
    active = false
    generation += 1
    cancelReconnect()
    releaseChannel()
    transport.disconnect()
    credentials = null
    reconnectPolicy.reset()
    dispatch(RadioEvent.Deactivate)
  }

  fun requestTransmission() {
    val channelId = state.channelId ?: return
    val identity = credentials ?: return
    if (state.phase != RadioPhase.LISTENING) return

    val requestGeneration = generation
    dispatch(RadioEvent.FloorRequested)

    transport.requestFloor(channelId) { ack ->
      if (requestGeneration != generation) {
        // El canal cambio mientras el backend arbitraba: liberar de inmediato
        // para no dejarlo ocupado por una sesion que ya no existe.
        ack.transmissionId?.let { transport.endFloor(channelId, it) { } }
        return@requestFloor
      }

      if (!ack.ok || ack.transmissionId == null) {
        dispatch(RadioEvent.FloorDenied(ack.error ?: "radio_unavailable", ack.transmitter))
        return@requestFloor
      }

      if (!audio.startCapture()) {
        transport.endFloor(channelId, ack.transmissionId) { }
        dispatch(RadioEvent.FloorDenied("radio_capture_start_failed", null))
        return@requestFloor
      }

      dispatch(
        RadioEvent.FloorGranted(
          transmissionId = ack.transmissionId,
          operator = RadioOperator(identity.userId, identity.userName.ifBlank { "Operador" }),
          startedAt = clock()
        )
      )
    }
  }

  fun endTransmission() {
    val channelId = state.channelId ?: return
    val transmissionId = state.transmissionId ?: return
    if (state.phase != RadioPhase.TRANSMITTING) return

    audio.stopCapture()
    dispatch(RadioEvent.LocalTransmissionEnded(null))
    transport.endFloor(channelId, transmissionId) { }
  }

  /** Llamadas tienen prioridad: el microfono no puede compartirse. */
  fun onCallStarted() {
    if (state.phase == RadioPhase.PAUSED_BY_CALL) return
    val channelId = state.channelId
    val transmissionId = state.transmissionId
    val wasTransmitting = state.phase == RadioPhase.TRANSMITTING
    audio.releaseAudio()
    dispatch(RadioEvent.CallStarted)
    if (wasTransmitting && channelId != null && transmissionId != null) {
      transport.endFloor(channelId, transmissionId) { }
    }
  }

  fun onCallEnded() {
    if (state.phase != RadioPhase.PAUSED_BY_CALL) return
    dispatch(RadioEvent.CallEnded)
    if (!active) return
    if (state.connected) joinCurrentChannel() else transport.connect(credentials ?: return)
  }

  // ---------------- Audio ----------------

  fun onFrameCaptured(base64Data: String, sequence: Int, capturedAt: Long) {
    val channelId = state.channelId ?: return
    val transmissionId = state.transmissionId ?: return
    if (state.phase != RadioPhase.TRANSMITTING) return

    val sent = transport.sendFrame(
      RadioOutboundFrame(
        channelId = channelId,
        transmissionId = transmissionId,
        sequence = sequence,
        sentAt = capturedAt,
        data = base64Data
      )
    )
    if (!sent) abortLocalCapture("radio_frame_transport_lost")
  }

  fun onAudioFailure(code: String) {
    if (state.phase == RadioPhase.TRANSMITTING) {
      abortLocalCapture(code)
      return
    }
    if (state.phase == RadioPhase.RECEIVING) {
      audio.stopPlayback()
      val transmissionId = state.transmissionId
      if (transmissionId != null) dispatch(RadioEvent.RemoteTransmissionEnded(transmissionId))
    }
  }

  // ---------------- Transporte ----------------

  override fun onConnected() {
    reconnectPolicy.reset()
    dispatch(RadioEvent.TransportConnected)
    if (active && state.phase != RadioPhase.PAUSED_BY_CALL) joinCurrentChannel()
  }

  override fun onDisconnected(reason: RadioDisconnectReason) {
    // Perder el transporte mientras se transmite cierra el microfono aunque el
    // runtime de React este congelado: nunca queda capturando a ciegas.
    audio.releaseAudio()

    if (reason == RadioDisconnectReason.UNAUTHORIZED) {
      dispatch(RadioEvent.JoinRejected(unauthorized = true, code = "radio_unauthorized"))
      return
    }

    dispatch(RadioEvent.TransportDisconnected)
    if (!active || !reconnectPolicy.shouldRetry(reason)) return
    scheduleReconnect()
  }

  override fun onRemoteTransmissionStarted(transmissionId: String, operator: RadioOperator) {
    // La autoridad de la transmision propia es el ACK, no el eco del broadcast.
    if (operator.id == credentials?.userId) return
    if (state.phase == RadioPhase.TRANSMITTING || state.phase == RadioPhase.PAUSED_BY_CALL) return

    if (!audio.startPlayback(transmissionId)) return
    dispatch(RadioEvent.RemoteTransmissionStarted(transmissionId, operator))
  }

  override fun onRemoteFrame(transmissionId: String, sequence: Int, data: String) {
    if (state.phase != RadioPhase.RECEIVING || state.transmissionId != transmissionId) return
    if (audio.enqueueFrame(transmissionId, sequence, data)) {
      dispatch(RadioEvent.RemoteFrame(transmissionId, clock()))
    }
  }

  override fun onRemoteTransmissionEnded(transmissionId: String, reason: String?) {
    // El backend puede cerrar la transmision propia: timeout, cadencia excedida o
    // perdida de arbitraje. Esa autoridad manda sobre la captura local.
    if (state.phase == RadioPhase.TRANSMITTING && state.transmissionId == transmissionId) {
      audio.stopCapture()
      dispatch(RadioEvent.LocalTransmissionEnded(reason))
      return
    }

    if (state.phase == RadioPhase.RECEIVING && state.transmissionId == transmissionId) {
      audio.stopPlayback()
    }
    dispatch(RadioEvent.RemoteTransmissionEnded(transmissionId))
  }

  override fun onServerError(message: String) {
    if (state.phase == RadioPhase.TRANSMITTING) abortLocalCapture("radio_realtime_error")
  }

  // ---------------- Interno ----------------

  private fun joinCurrentChannel() {
    val channelId = state.channelId ?: return
    val joinGeneration = generation

    transport.join(channelId) { ack ->
      if (joinGeneration != generation) return@join
      if (ack.ok) {
        dispatch(RadioEvent.Joined)
        return@join
      }

      val unauthorized = ack.error == RadioSessionReducer.FORBIDDEN ||
        ack.error == RadioSessionReducer.UNAUTHORIZED
      if (unauthorized) {
        dispatch(RadioEvent.JoinRejected(true, ack.error ?: "radio_unauthorized"))
        return@join
      }

      dispatch(RadioEvent.JoinRejected(false, ack.error ?: "radio_join_failed"))
      if (active) scheduleReconnect()
    }
  }

  /**
   * Nunca se restaura una transmision perdida: el operador vuelve a pulsar PTT.
   * Reanudar solo puede producir audio que nadie sabe que se esta enviando.
   */
  private fun scheduleReconnect() {
    cancelReconnect()
    val identity = credentials ?: return
    val delay = reconnectPolicy.nextDelayMs()
    pendingReconnect = scheduler.postDelayed(delay) {
      pendingReconnect = null
      if (!active) return@postDelayed
      transport.connect(identity)
    }
  }

  private fun cancelReconnect() {
    pendingReconnect?.cancel()
    pendingReconnect = null
  }

  private fun abortLocalCapture(code: String) {
    val channelId = state.channelId
    val transmissionId = state.transmissionId
    audio.stopCapture()
    dispatch(RadioEvent.LocalTransmissionEnded(code))
    if (channelId != null && transmissionId != null) {
      transport.endFloor(channelId, transmissionId) { }
    }
  }

  private fun releaseChannel() {
    val channelId = state.channelId
    val transmissionId = state.transmissionId
    audio.releaseAudio()
    if (channelId != null) {
      if (transmissionId != null && state.phase == RadioPhase.TRANSMITTING) {
        transport.endFloor(channelId, transmissionId) { }
      }
      transport.leave(channelId)
    }
  }

  private fun dispatch(event: RadioEvent) {
    val next = RadioSessionReducer.reduce(state, event)
    if (next == state) return
    state = next
    onStateChanged(next)
  }
}
