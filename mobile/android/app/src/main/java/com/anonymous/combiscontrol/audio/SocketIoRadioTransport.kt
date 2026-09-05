package com.anonymous.combiscontrol.audio

import android.os.Handler
import android.os.Looper
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

/**
 * Transporte Socket.IO nativo de Radio. Habla los mismos contratos `radio:*` que
 * el backend ya expone; no introduce un segundo protocolo ni un segundo modelo de
 * autorizacion. La forma exacta de cada payload vive en RadioProtocol.
 *
 * Autenticacion: `auth.token` con el JWT crudo, identico a lo que envia el socket
 * compartido de JavaScript (`io(SOCKET_URL, { auth: { token } })`) y a lo que lee
 * el middleware del backend (`socket.handshake.auth.token`).
 *
 * La reconexion propia de Socket.IO queda deshabilitada a proposito: el unico
 * algoritmo de reconexion de Radio es RadioReconnectPolicy, gobernado por el
 * controlador de sesion. Dos algoritmos compitiendo producirian rejoins cruzados.
 */
class SocketIoRadioTransport : RadioTransport {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var socket: Socket? = null
  private var listener: RadioTransportListener? = null
  private var manualDisconnect = false

  override fun setListener(listener: RadioTransportListener?) {
    this.listener = listener
  }

  override fun connect(credentials: RadioSessionCredentials) {
    disconnect()
    manualDisconnect = false

    val options = IO.Options().apply {
      auth = mapOf("token" to credentials.token)
      transports = arrayOf("websocket", "polling")
      reconnection = false
      timeout = CONNECT_TIMEOUT_MS
      // IO.socket() cachea el Manager por URI. Sin forceNew, reconectar o cambiar
      // de cuenta podria reutilizar un manager cerrado o con el token anterior en
      // el handshake, y el backend rechazaria o autenticaria a quien no toca.
      forceNew = true
      multiplex = false
    }

    val next = try {
      IO.socket(URI.create(credentials.socketUrl), options)
    } catch (error: Exception) {
      RadioLog.error("socket_url_invalid", error)
      listener?.onDisconnected(RadioDisconnectReason.SERVER)
      return
    }

    next.on(Socket.EVENT_CONNECT) {
      if (socket !== next || manualDisconnect) return@on
      RadioLog.event("socket_connected")
      listener?.onConnected()
    }
    next.on(Socket.EVENT_DISCONNECT) { args ->
      if (socket !== next || manualDisconnect) return@on
      val reason = disconnectReasonOf(args.firstOrNull()?.toString())
      RadioLog.event("socket_disconnected", "reason" to reason.name)
      listener?.onDisconnected(reason)
    }
    next.on(Socket.EVENT_CONNECT_ERROR) { args ->
      if (socket !== next || manualDisconnect) return@on
      // El mensaje de error puede citar el motivo de auth; nunca el token.
      val reason = if (isUnauthorized(args.firstOrNull()?.toString().orEmpty())) {
        RadioDisconnectReason.UNAUTHORIZED
      } else {
        RadioDisconnectReason.NETWORK
      }
      RadioLog.event("socket_connect_error", "reason" to reason.name)
      listener?.onDisconnected(reason)
    }
    next.on(EVENT_START) { args ->
      if (socket !== next || manualDisconnect) return@on
      RadioProtocol.parseRemoteStart(args.firstOrNull())?.let { start ->
        listener?.onRemoteTransmissionStarted(start.transmissionId, start.operator)
      }
    }
    next.on(EVENT_FRAME) { args ->
      if (socket !== next || manualDisconnect) return@on
      RadioProtocol.parseRemoteFrame(args.firstOrNull())?.let { frame ->
        listener?.onRemoteFrame(frame.transmissionId, frame.sequence, frame.data)
      }
    }
    next.on(EVENT_END) { args ->
      if (socket !== next || manualDisconnect) return@on
      RadioProtocol.parseRemoteEnd(args.firstOrNull())?.let { end ->
        listener?.onRemoteTransmissionEnded(end.transmissionId, end.reason)
      }
    }
    next.on(EVENT_ERROR) { args ->
      if (socket !== next || manualDisconnect) return@on
      val message = RadioProtocol.parseServerError(args.firstOrNull())
      RadioLog.warn("server_error")
      listener?.onServerError(message)
    }

    socket = next
    RadioLog.event("socket_connecting")
    next.connect()
  }

  override fun disconnect() {
    val current = socket ?: return
    manualDisconnect = true
    socket = null
    try {
      current.off()
      current.disconnect()
      current.close()
    } catch (error: Exception) {
      RadioLog.error("socket_close_failed", error)
    }
  }

  override fun join(channelId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(EVENT_JOIN, RadioProtocol.channelPayload(channelId), ack)
  }

  override fun leave(channelId: String) {
    val current = socket ?: return
    if (!current.connected()) return
    current.emit(EVENT_LEAVE, RadioProtocol.channelPayload(channelId))
  }

  override fun requestFloor(channelId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(EVENT_START, RadioProtocol.channelPayload(channelId), ack)
  }

  override fun endFloor(channelId: String, transmissionId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(EVENT_END, RadioProtocol.endPayload(channelId, transmissionId), ack)
  }

  override fun sendFrame(frame: RadioOutboundFrame): Boolean {
    val current = socket ?: return false
    if (!current.connected()) return false
    return try {
      current.emit(EVENT_FRAME, RadioProtocol.framePayload(frame))
      true
    } catch (error: Exception) {
      RadioLog.error("frame_emit_failed", error)
      false
    }
  }

  /**
   * Los ACK llevan timeout propio: un backend que nunca responde no puede dejar
   * al operador esperando indefinidamente con el canal a medio pedir. El mismo
   * valor que usaba el transporte de JavaScript (`socket.timeout(5000)`).
   */
  private fun emitWithAck(event: String, payload: JSONObject, ack: (RadioAck) -> Unit) {
    val current = socket
    if (current == null || !current.connected()) {
      ack(RadioAck(ok = false, error = RadioAck.ERROR_DISCONNECTED))
      return
    }

    // `settled`, el timeout y la resolucion viven todos en el hilo principal:
    // no hay carrera entre el vencimiento y la respuesta del backend.
    var settled = false
    val timeout = Runnable {
      if (settled) return@Runnable
      settled = true
      ack(RadioAck(ok = false, error = RadioAck.ERROR_TIMEOUT))
    }
    mainHandler.postDelayed(timeout, ACK_TIMEOUT_MS)

    try {
      current.emit(event, arrayOf<Any>(payload)) { args ->
        mainHandler.post {
          if (settled) return@post
          settled = true
          mainHandler.removeCallbacks(timeout)
          ack(RadioProtocol.parseAck(args.firstOrNull()))
        }
      }
    } catch (error: Exception) {
      mainHandler.removeCallbacks(timeout)
      if (!settled) {
        settled = true
        RadioLog.error("emit_failed", error, "event" to event)
        ack(RadioAck(ok = false, error = RadioAck.ERROR_DISCONNECTED))
      }
    }
  }

  private fun disconnectReasonOf(reason: String?): RadioDisconnectReason = when {
    reason == null -> RadioDisconnectReason.NETWORK
    reason.contains("server", ignoreCase = true) -> RadioDisconnectReason.SERVER
    else -> RadioDisconnectReason.NETWORK
  }

  private fun isUnauthorized(message: String): Boolean {
    val value = message.lowercase()
    return value.contains("unauthorized") || value.contains("invalid token") ||
      value.contains("jwt") || value.contains("token expired") || value.contains("authentication failed")
  }

  companion object {
    private const val ACK_TIMEOUT_MS = 5000L
    private const val CONNECT_TIMEOUT_MS = 15000L

    const val EVENT_JOIN = "radio:join"
    const val EVENT_LEAVE = "radio:leave"
    const val EVENT_START = "radio:start"
    const val EVENT_FRAME = "radio:frame"
    const val EVENT_END = "radio:end"
    const val EVENT_ERROR = "radio:error"
  }
}
