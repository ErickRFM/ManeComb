package com.anonymous.combiscontrol.audio

import android.os.Handler
import android.os.Looper
import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import org.json.JSONObject
import java.net.URI

/**
 * Transporte Socket.IO nativo de Radio. Habla los mismos contratos `radio:*` que
 * el backend ya expone; no introduce un segundo protocolo ni un segundo modelo de
 * autorizacion.
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
    }

    val next = try {
      IO.socket(URI.create(credentials.socketUrl), options)
    } catch (error: Exception) {
      Log.e(TAG, "Invalid Radio socket URL", error)
      listener?.onDisconnected(RadioDisconnectReason.SERVER)
      return
    }

    next.on(Socket.EVENT_CONNECT) { listener?.onConnected() }
    next.on(Socket.EVENT_DISCONNECT) { args ->
      if (manualDisconnect) return@on
      listener?.onDisconnected(disconnectReasonOf(args.firstOrNull()?.toString()))
    }
    next.on(Socket.EVENT_CONNECT_ERROR) { args ->
      if (manualDisconnect) return@on
      val message = args.firstOrNull()?.toString().orEmpty()
      listener?.onDisconnected(
        if (isUnauthorized(message)) RadioDisconnectReason.UNAUTHORIZED
        else RadioDisconnectReason.NETWORK
      )
    }
    next.on(EVENT_START) { args -> handleRemoteStart(args.firstOrNull()) }
    next.on(EVENT_FRAME) { args -> handleRemoteFrame(args.firstOrNull()) }
    next.on(EVENT_END) { args -> handleRemoteEnd(args.firstOrNull()) }
    next.on(EVENT_ERROR) { args ->
      val payload = args.firstOrNull() as? JSONObject
      listener?.onServerError(payload?.optString("message").orEmpty())
    }

    socket = next
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
      Log.w(TAG, "Radio socket close failed", error)
    }
  }

  override fun join(channelId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(EVENT_JOIN, JSONObject().put("channelId", channelId), ack)
  }

  override fun leave(channelId: String) {
    val current = socket ?: return
    if (!current.connected()) return
    current.emit(EVENT_LEAVE, JSONObject().put("channelId", channelId))
  }

  override fun requestFloor(channelId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(EVENT_START, JSONObject().put("channelId", channelId), ack)
  }

  override fun endFloor(channelId: String, transmissionId: String, ack: (RadioAck) -> Unit) {
    emitWithAck(
      EVENT_END,
      JSONObject().put("channelId", channelId).put("transmissionId", transmissionId),
      ack
    )
  }

  override fun sendFrame(frame: RadioOutboundFrame): Boolean {
    val current = socket ?: return false
    if (!current.connected()) return false
    return try {
      current.emit(
        EVENT_FRAME,
        JSONObject()
          .put("channelId", frame.channelId)
          .put("transmissionId", frame.transmissionId)
          .put("sequence", frame.sequence)
          .put("sentAt", frame.sentAt)
          .put("data", frame.data)
      )
      true
    } catch (error: Exception) {
      Log.w(TAG, "Radio frame emit failed", error)
      false
    }
  }

  /**
   * Los ACK llevan timeout propio: un backend que nunca responde no puede dejar
   * al operador esperando indefinidamente con el canal a medio pedir.
   */
  private fun emitWithAck(event: String, payload: JSONObject, ack: (RadioAck) -> Unit) {
    val current = socket
    if (current == null || !current.connected()) {
      ack(RadioAck(ok = false, error = RadioAck.ERROR_DISCONNECTED))
      return
    }

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
          ack(parseAck(args.firstOrNull()))
        }
      }
    } catch (error: Exception) {
      mainHandler.removeCallbacks(timeout)
      if (!settled) {
        settled = true
        ack(RadioAck(ok = false, error = RadioAck.ERROR_DISCONNECTED))
      }
    }
  }

  private fun parseAck(raw: Any?): RadioAck {
    val payload = raw as? JSONObject ?: return RadioAck(ok = false, error = "radio_invalid_ack")
    return RadioAck(
      ok = payload.optBoolean("ok", false),
      error = payload.optString("error").takeIf { it.isNotBlank() },
      transmissionId = payload.optString("transmissionId").takeIf { it.isNotBlank() },
      transmitter = parseOperator(payload.optJSONObject("transmitter"))
    )
  }

  private fun parseOperator(payload: JSONObject?): RadioOperator? {
    val id = payload?.optString("id").orEmpty()
    if (id.isBlank()) return null
    return RadioOperator(id, payload?.optString("name").orEmpty().ifBlank { "Operador" })
  }

  private fun handleRemoteStart(raw: Any?) {
    val payload = raw as? JSONObject ?: return
    val transmissionId = payload.optString("transmissionId")
    val operator = parseOperator(payload.optJSONObject("transmitter"))
    if (transmissionId.isBlank() || operator == null) return
    listener?.onRemoteTransmissionStarted(transmissionId, operator)
  }

  private fun handleRemoteFrame(raw: Any?) {
    val payload = raw as? JSONObject ?: return
    val transmissionId = payload.optString("transmissionId")
    val data = payload.optString("data")
    if (transmissionId.isBlank() || data.isBlank()) return
    listener?.onRemoteFrame(transmissionId, payload.optInt("sequence", -1), data)
  }

  private fun handleRemoteEnd(raw: Any?) {
    val payload = raw as? JSONObject ?: return
    val transmissionId = payload.optString("transmissionId")
    if (transmissionId.isBlank()) return
    listener?.onRemoteTransmissionEnded(
      transmissionId,
      payload.optString("reason").takeIf { it.isNotBlank() }
    )
  }

  private fun disconnectReasonOf(reason: String?): RadioDisconnectReason = when {
    reason == null -> RadioDisconnectReason.NETWORK
    reason.contains("server", ignoreCase = true) -> RadioDisconnectReason.SERVER
    else -> RadioDisconnectReason.NETWORK
  }

  private fun isUnauthorized(message: String): Boolean {
    val value = message.lowercase()
    return value.contains("unauthorized") || value.contains("invalid token") || value.contains("jwt")
  }

  companion object {
    private const val TAG = "ManeCombRadioSocket"
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
