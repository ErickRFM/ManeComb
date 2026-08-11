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
 *
 * CONFINAMIENTO DE HILO: los comandos llegan del hilo de modulos de React, los
 * eventos de transporte del hilo de Socket.IO y los frames del hilo de captura.
 * `confine` traslada todos esos puntos de entrada a un unico hilo de sesion, de
 * modo que el estado no necesita locks y `stopCapture()` nunca bloquea al hilo
 * que produce frames. En pruebas se ejecuta en linea.
 */
class RadioSessionController(
  private val transport: RadioTransport,
  private val audio: RadioAudioEngine,
  private val scheduler: RadioScheduler,
  private val reconnectPolicy: RadioReconnectPolicy = RadioReconnectPolicy(),
  private val clock: () -> Long = System::currentTimeMillis,
  private val confine: (() -> Unit) -> Unit = { action -> action() },
  private val onStateChanged: (RadioSessionState) -> Unit
) : RadioTransportListener {

  @Volatile private var state = RadioSessionState()
  private var credentials: RadioSessionCredentials? = null
  private var pendingReconnect: RadioCancellable? = null
  private var active = false
  /** Generacion de sesion: descarta ACK y eventos de un canal ya abandonado. */
  private var generation = 0

  init {
    transport.setListener(this)
  }

  fun snapshot(): RadioSessionState = state

  // ---------------- Comandos (puntos de entrada externos) ----------------

  fun activate(nextCredentials: RadioSessionCredentials, channelId: String) =
    confine { activateOnSession(nextCredentials, channelId) }

  fun selectChannel(channelId: String) = confine { selectChannelOnSession(channelId) }

  fun deactivate() = confine { deactivateOnSession() }

  fun requestTransmission() = confine { requestTransmissionOnSession() }

  fun endTransmission() = confine { endTransmissionOnSession() }

  fun onCallStarted() = confine { callStartedOnSession() }

  fun onCallEnded() = confine { callEndedOnSession() }

  fun onFrameCaptured(base64Data: String, sequence: Int, capturedAt: Long) =
    confine { frameCapturedOnSession(base64Data, sequence, capturedAt) }

  fun onAudioFailure(code: String) = confine { audioFailureOnSession(code) }

  override fun onConnected() = confine { connectedOnSession() }

  override fun onDisconnected(reason: RadioDisconnectReason) =
    confine { disconnectedOnSession(reason) }

  override fun onRemoteTransmissionStarted(transmissionId: String, operator: RadioOperator) =
    confine { remoteStartedOnSession(transmissionId, operator) }

  override fun onRemoteFrame(transmissionId: String, sequence: Int, data: String) =
    confine { remoteFrameOnSession(transmissionId, sequence, data) }

  override fun onRemoteTransmissionEnded(transmissionId: String, reason: String?) =
    confine { remoteEndedOnSession(transmissionId, reason) }

  override fun onServerError(message: String) = confine { serverErrorOnSession() }

  // ---------------- Sesion (hilo unico) ----------------

  private fun activateOnSession(nextCredentials: RadioSessionCredentials, channelId: String) {
    if (!nextCredentials.isUsable || channelId.isBlank()) {
      deactivateOnSession()
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
      RadioLog.event("activate", "channelId" to channelId, "reason" to "identity")
      releaseChannel()
      dispatch(RadioEvent.Activate(channelId))
      reconnectPolicy.reset()
      transport.connect(nextCredentials)
      return
    }

    selectChannelOnSession(channelId)
  }

  private fun selectChannelOnSession(channelId: String) {
    if (!active || channelId.isBlank()) return
    if (state.channelId == channelId && state.phase != RadioPhase.IDLE) return

    // Cambiar de canal cierra lo que estuviera en curso en el anterior antes de
    // pedir el nuevo: nunca quedan dos canales vivos.
    RadioLog.event("select_channel", "channelId" to channelId)
    releaseChannel()
    generation += 1
    dispatch(RadioEvent.Activate(channelId))
    if (state.connected) joinCurrentChannel() else transport.connect(credentials ?: return)
  }

  private fun deactivateOnSession() {
    RadioLog.event("deactivate")
    active = false
    generation += 1
    cancelReconnect()
    releaseChannel()
    transport.disconnect()
    credentials = null
    reconnectPolicy.reset()
    dispatch(RadioEvent.Deactivate)
  }

  private fun requestTransmissionOnSession() {
    val channelId = state.channelId ?: return
    val identity = credentials ?: return
    if (state.phase != RadioPhase.LISTENING) return

    val requestGeneration = generation
    RadioLog.event("floor_requested", "channelId" to channelId)
    dispatch(RadioEvent.FloorRequested)

    transport.requestFloor(channelId) { ack ->
      confine {
        if (requestGeneration != generation) {
          // El canal cambio mientras el backend arbitraba: liberar de inmediato
          // para no dejarlo ocupado por una sesion que ya no existe.
          RadioLog.warn("floor_stale", "channelId" to channelId)
          ack.transmissionId?.let { transport.endFloor(channelId, it) { } }
          return@confine
        }

        if (!ack.ok || ack.transmissionId == null) {
          RadioLog.warn("floor_denied", "channelId" to channelId, "error" to ack.error)
          dispatch(RadioEvent.FloorDenied(ack.error ?: "radio_unavailable", ack.transmitter))
          // Si el backend dice que no estamos en la sala, el cliente debe
          // reincorporarse solo; de otro modo quedaria sin poder transmitir nunca.
          if (ack.error == ERROR_NOT_JOINED && active) joinCurrentChannel()
          return@confine
        }

        if (!audio.startCapture()) {
          RadioLog.warn("capture_start_failed", "channelId" to channelId)
          transport.endFloor(channelId, ack.transmissionId) { }
          dispatch(RadioEvent.FloorDenied("radio_capture_start_failed", null))
          return@confine
        }

        RadioLog.event(
          "tx_started",
          "channelId" to channelId,
          "transmissionId" to ack.transmissionId
        )
        dispatch(
          RadioEvent.FloorGranted(
            transmissionId = ack.transmissionId,
            operator = RadioOperator(identity.userId, identity.userName.ifBlank { "Operador" }),
            startedAt = clock()
          )
        )
      }
    }
  }

  private fun endTransmissionOnSession() {
    val channelId = state.channelId ?: return
    val transmissionId = state.transmissionId ?: return
    if (state.phase != RadioPhase.TRANSMITTING) return

    RadioLog.event("tx_ended", "channelId" to channelId, "transmissionId" to transmissionId)
    audio.stopCapture()
    dispatch(RadioEvent.LocalTransmissionEnded(null))
    transport.endFloor(channelId, transmissionId) { }
  }

  /** Llamadas tienen prioridad: el microfono no puede compartirse. */
  private fun callStartedOnSession() {
    if (state.phase == RadioPhase.PAUSED_BY_CALL) return
    val channelId = state.channelId
    val transmissionId = state.transmissionId
    val wasTransmitting = state.phase == RadioPhase.TRANSMITTING
    RadioLog.event("call_pause", "wasTransmitting" to wasTransmitting)
    audio.releaseAudio()
    dispatch(RadioEvent.CallStarted)
    if (wasTransmitting && channelId != null && transmissionId != null) {
      transport.endFloor(channelId, transmissionId) { }
    }
  }

  private fun callEndedOnSession() {
    if (state.phase != RadioPhase.PAUSED_BY_CALL) return
    RadioLog.event("call_resume")
    dispatch(RadioEvent.CallEnded)
    if (!active) return
    if (state.connected) joinCurrentChannel() else transport.connect(credentials ?: return)
  }

  private fun frameCapturedOnSession(base64Data: String, sequence: Int, capturedAt: Long) {
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

  private fun audioFailureOnSession(code: String) {
    RadioLog.warn("audio_failure", "code" to code)
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

  private fun connectedOnSession() {
    reconnectPolicy.reset()
    dispatch(RadioEvent.TransportConnected)
    if (active && state.phase != RadioPhase.PAUSED_BY_CALL) joinCurrentChannel()
  }

  private fun disconnectedOnSession(reason: RadioDisconnectReason) {
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

  private fun remoteStartedOnSession(transmissionId: String, operator: RadioOperator) {
    // La autoridad de la transmision propia es el ACK, no el eco del broadcast.
    if (operator.id == credentials?.userId) return
    if (state.phase == RadioPhase.TRANSMITTING || state.phase == RadioPhase.PAUSED_BY_CALL) return

    if (!audio.startPlayback(transmissionId)) return
    RadioLog.event("rx_started", "transmissionId" to transmissionId)
    dispatch(RadioEvent.RemoteTransmissionStarted(transmissionId, operator))
  }

  private fun remoteFrameOnSession(transmissionId: String, sequence: Int, data: String) {
    if (state.phase != RadioPhase.RECEIVING || state.transmissionId != transmissionId) return
    if (audio.enqueueFrame(transmissionId, sequence, data)) {
      // `lastFrameAt` es bookkeeping interno. Publicarlo por cada paquete haria
      // que cada frame RX cruzara al hilo principal y al bridge de React,
      // exactamente lo que la arquitectura nativa pretende evitar.
      applyState(RadioEvent.RemoteFrame(transmissionId, clock()), publish = false)
    }
  }

  private fun remoteEndedOnSession(transmissionId: String, reason: String?) {
    // El backend puede cerrar la transmision propia: timeout, cadencia excedida o
    // perdida de arbitraje. Esa autoridad manda sobre la captura local.
    if (state.phase == RadioPhase.TRANSMITTING && state.transmissionId == transmissionId) {
      RadioLog.warn("tx_revoked", "transmissionId" to transmissionId, "reason" to reason)
      audio.stopCapture()
      dispatch(RadioEvent.LocalTransmissionEnded(reason))
      return
    }

    if (state.phase == RadioPhase.RECEIVING && state.transmissionId == transmissionId) {
      RadioLog.event("rx_ended", "transmissionId" to transmissionId)
      audio.stopPlayback()
    }
    dispatch(RadioEvent.RemoteTransmissionEnded(transmissionId))
  }

  private fun serverErrorOnSession() {
    if (state.phase == RadioPhase.TRANSMITTING) abortLocalCapture("radio_realtime_error")
  }

  // ---------------- Interno ----------------

  private fun joinCurrentChannel() {
    val channelId = state.channelId ?: return
    val joinGeneration = generation
    RadioLog.event("join_requested", "channelId" to channelId)

    transport.join(channelId) { ack ->
      confine {
        if (joinGeneration != generation) return@confine
        if (ack.ok) {
          RadioLog.event("join_granted", "channelId" to channelId)
          dispatch(RadioEvent.Joined)
          return@confine
        }

        val unauthorized = ack.error == RadioSessionReducer.FORBIDDEN ||
          ack.error == RadioSessionReducer.UNAUTHORIZED
        RadioLog.warn("join_denied", "channelId" to channelId, "error" to ack.error)
        if (unauthorized) {
          dispatch(RadioEvent.JoinRejected(true, ack.error ?: "radio_unauthorized"))
          return@confine
        }

        dispatch(RadioEvent.JoinRejected(false, ack.error ?: "radio_join_failed"))
        if (active) scheduleReconnect()
      }
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
    RadioLog.event("reconnect_scheduled", "delayMs" to delay, "attempt" to reconnectPolicy.attempts())
    pendingReconnect = scheduler.postDelayed(delay) {
      pendingReconnect = null
      if (!active) return@postDelayed
      RadioLog.event("reconnect_attempt")
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
    RadioLog.warn("tx_aborted", "code" to code, "transmissionId" to transmissionId)
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

  private fun applyState(event: RadioEvent, publish: Boolean = true) {
    val next = RadioSessionReducer.reduce(state, event)
    if (next == state) return
    state = next
    if (publish) onStateChanged(next)
  }

  private fun dispatch(event: RadioEvent) = applyState(event)

  private companion object {
    /** El backend responde esto cuando el socket ya no esta en la sala del canal. */
    const val ERROR_NOT_JOINED = "radio_not_joined"
  }
}
