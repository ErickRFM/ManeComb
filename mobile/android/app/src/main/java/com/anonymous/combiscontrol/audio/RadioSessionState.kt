package com.anonymous.combiscontrol.audio

/**
 * Maquina de estados operativa de Radio en Android. Es pura (sin dependencias de
 * Android ni de red) para poder certificarla en JVM.
 *
 * Usa exactamente el mismo vocabulario de fases que `radio-live-machine.ts`: el
 * runtime de React proyecta este estado sin traducirlo, de modo que no existe una
 * segunda interpretacion posible del mismo hecho.
 */
enum class RadioPhase {
  IDLE,
  JOINING,
  LISTENING,
  REQUESTING,
  TRANSMITTING,
  RECEIVING,
  CHANNEL_BUSY,
  RECONNECTING,
  PAUSED_BY_CALL,
  UNAUTHORIZED,
  ERROR
}

data class RadioOperator(val id: String, val name: String)

data class RadioSessionState(
  val phase: RadioPhase = RadioPhase.IDLE,
  val channelId: String? = null,
  /** Transmision en curso, propia (TRANSMITTING) o ajena (RECEIVING). */
  val transmissionId: String? = null,
  val operator: RadioOperator? = null,
  val transmissionStartedAt: Long? = null,
  val lastFrameAt: Long? = null,
  val connected: Boolean = false,
  val errorCode: String? = null
) {
  /** True mientras el microfono debe estar capturando. */
  val capturing: Boolean get() = phase == RadioPhase.TRANSMITTING

  /** True mientras la salida debe estar reproduciendo audio recibido. */
  val playing: Boolean get() = phase == RadioPhase.RECEIVING
}

sealed class RadioEvent {
  data class Activate(val channelId: String) : RadioEvent()
  object Deactivate : RadioEvent()
  object TransportConnected : RadioEvent()
  object TransportReconnecting : RadioEvent()
  object TransportDisconnected : RadioEvent()
  object Joined : RadioEvent()
  data class JoinRejected(val unauthorized: Boolean, val code: String) : RadioEvent()
  object FloorRequested : RadioEvent()
  data class FloorGranted(
    val transmissionId: String,
    val operator: RadioOperator,
    val startedAt: Long
  ) : RadioEvent()
  data class FloorDenied(val code: String, val operator: RadioOperator?) : RadioEvent()
  /** Fin de la transmision propia, lo pida el operador o lo imponga el backend. */
  data class LocalTransmissionEnded(val code: String?) : RadioEvent()
  data class RemoteTransmissionStarted(
    val transmissionId: String,
    val operator: RadioOperator
  ) : RadioEvent()
  data class RemoteFrame(val transmissionId: String, val receivedAt: Long) : RadioEvent()
  data class RemoteTransmissionEnded(val transmissionId: String) : RadioEvent()
  object CallStarted : RadioEvent()
  object CallEnded : RadioEvent()
  data class Failed(val code: String) : RadioEvent()
}

object RadioSessionReducer {

  fun reduce(state: RadioSessionState, event: RadioEvent): RadioSessionState = when (event) {
    is RadioEvent.Activate ->
      if (state.channelId == event.channelId && state.phase != RadioPhase.IDLE) {
        state
      } else {
        RadioSessionState(
          phase = RadioPhase.JOINING,
          channelId = event.channelId,
          connected = state.connected
        )
      }

    RadioEvent.Deactivate -> RadioSessionState()

    RadioEvent.TransportConnected -> state.copy(connected = true)

    RadioEvent.TransportReconnecting -> state.copy(
      phase = if (state.phase == RadioPhase.PAUSED_BY_CALL) state.phase else RadioPhase.RECONNECTING,
      connected = false,
      transmissionId = null,
      operator = null,
      transmissionStartedAt = null
    )

    RadioEvent.TransportDisconnected -> state.copy(
      phase = if (state.phase == RadioPhase.PAUSED_BY_CALL) state.phase else RadioPhase.RECONNECTING,
      connected = false,
      transmissionId = null,
      operator = null,
      transmissionStartedAt = null
    )

    // LISTENING solo procede del ACK de radio:join. Nunca de un temporizador.
    RadioEvent.Joined ->
      if (state.channelId == null || state.phase == RadioPhase.PAUSED_BY_CALL) {
        state
      } else {
        state.copy(
          phase = RadioPhase.LISTENING,
          connected = true,
          transmissionId = null,
          operator = null,
          transmissionStartedAt = null,
          errorCode = null
        )
      }

    is RadioEvent.JoinRejected -> state.copy(
      phase = if (event.unauthorized) RadioPhase.UNAUTHORIZED else RadioPhase.ERROR,
      transmissionId = null,
      operator = null,
      transmissionStartedAt = null,
      errorCode = event.code
    )

    // El canal solo se pide desde escucha estable: con dueno ajeno no se pide.
    RadioEvent.FloorRequested ->
      if (state.phase != RadioPhase.LISTENING) state
      else state.copy(phase = RadioPhase.REQUESTING, errorCode = null)

    is RadioEvent.FloorGranted ->
      if (state.phase != RadioPhase.REQUESTING) state
      else state.copy(
        phase = RadioPhase.TRANSMITTING,
        transmissionId = event.transmissionId,
        operator = event.operator,
        transmissionStartedAt = event.startedAt,
        errorCode = null
      )

    is RadioEvent.FloorDenied ->
      if (state.phase != RadioPhase.REQUESTING) state
      else if (event.code == CHANNEL_BUSY) state.copy(
        phase = RadioPhase.CHANNEL_BUSY,
        transmissionId = null,
        operator = event.operator,
        transmissionStartedAt = null
      )
      else if (event.code == FORBIDDEN || event.code == UNAUTHORIZED) state.copy(
        phase = RadioPhase.UNAUTHORIZED,
        transmissionId = null,
        operator = null,
        transmissionStartedAt = null,
        errorCode = event.code
      )
      else state.copy(
        phase = RadioPhase.LISTENING,
        transmissionId = null,
        operator = null,
        transmissionStartedAt = null,
        errorCode = event.code
      )

    is RadioEvent.LocalTransmissionEnded ->
      if (state.phase != RadioPhase.TRANSMITTING && state.phase != RadioPhase.REQUESTING) state
      else state.copy(
        phase = RadioPhase.LISTENING,
        transmissionId = null,
        operator = null,
        transmissionStartedAt = null,
        errorCode = event.code ?: state.errorCode
      )

    is RadioEvent.RemoteTransmissionStarted ->
      if (state.phase == RadioPhase.PAUSED_BY_CALL ||
        state.phase == RadioPhase.TRANSMITTING ||
        state.phase == RadioPhase.UNAUTHORIZED
      ) state
      else state.copy(
        phase = RadioPhase.RECEIVING,
        transmissionId = event.transmissionId,
        operator = event.operator,
        transmissionStartedAt = null,
        errorCode = null
      )

    is RadioEvent.RemoteFrame ->
      if (state.transmissionId != event.transmissionId) state
      else state.copy(lastFrameAt = event.receivedAt)

    // CHANNEL_BUSY no guarda el transmissionId ajeno: lo libera cualquier
    // radio:end del canal, que es la unica autoridad para hacerlo.
    is RadioEvent.RemoteTransmissionEnded ->
      if (state.phase == RadioPhase.CHANNEL_BUSY) {
        state.copy(phase = RadioPhase.LISTENING, operator = null)
      } else if (state.phase != RadioPhase.RECEIVING ||
        state.transmissionId != event.transmissionId
      ) {
        state
      } else {
        state.copy(
          phase = RadioPhase.LISTENING,
          transmissionId = null,
          operator = null
        )
      }

    RadioEvent.CallStarted -> state.copy(
      phase = RadioPhase.PAUSED_BY_CALL,
      transmissionId = null,
      operator = null,
      transmissionStartedAt = null
    )

    RadioEvent.CallEnded ->
      if (state.phase != RadioPhase.PAUSED_BY_CALL) state
      else state.copy(
        phase = if (state.channelId == null) RadioPhase.IDLE else RadioPhase.JOINING
      )

    is RadioEvent.Failed -> state.copy(
      phase = RadioPhase.ERROR,
      transmissionId = null,
      operator = null,
      transmissionStartedAt = null,
      errorCode = event.code
    )
  }

  const val CHANNEL_BUSY = "channel_busy"
  const val FORBIDDEN = "forbidden"
  const val UNAUTHORIZED = "unauthorized"
}
