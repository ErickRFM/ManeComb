package com.anonymous.combiscontrol.audio

import org.json.JSONObject

/**
 * Serializacion del protocolo `radio:*`. Es la traduccion literal de lo que
 * `backend/src/sockets/index.js` recibe y emite hoy; se mantiene aparte del
 * transporte para poder certificarla en JVM con payloads reales del backend.
 *
 * Contratos vigentes (backend como autoridad):
 *
 *   radio:join   -> { channelId }            ack { ok, channelId, historyRoom, liveRoom, socketId }
 *                                            ack { ok:false, error:"forbidden" }
 *   radio:leave  -> { channelId }            ack { ok } | { ok:false, error:"channel_required" }
 *   radio:start  -> { channelId }            ack { ok, transmissionId }
 *                                            ack { ok:false, error:"channel_busy",
 *                                                  channelId, transmissionId?, transmitter? }
 *                                            ack { ok:false, error:"forbidden"|"radio_not_joined"
 *                                                  |"radio_unavailable" }
 *   radio:frame  -> { channelId, transmissionId, sequence, sentAt, data }   (sin ack)
 *   radio:end    -> { channelId, transmissionId }
 *                                            ack { ok } | { ok:false, error:"transmission_not_active" }
 *
 * Difusiones:
 *   radio:start  <- { channelId, transmissionId, startedAt, transmitter:{ id, name } }
 *   radio:frame  <- { channelId, data, sequence, sentAt, transmissionId }
 *   radio:end    <- { channelId, reason, transmissionId }
 *   radio:error  <- { message }
 */
object RadioProtocol {

  fun channelPayload(channelId: String): JSONObject =
    JSONObject().put("channelId", channelId)

  fun endPayload(channelId: String, transmissionId: String): JSONObject =
    JSONObject()
      .put("channelId", channelId)
      .put("transmissionId", transmissionId)

  fun framePayload(frame: RadioOutboundFrame): JSONObject =
    JSONObject()
      .put("channelId", frame.channelId)
      .put("transmissionId", frame.transmissionId)
      .put("sequence", frame.sequence)
      .put("sentAt", frame.sentAt)
      .put("data", frame.data)

  fun parseAck(raw: Any?): RadioAck {
    val payload = raw as? JSONObject ?: return RadioAck(ok = false, error = "radio_invalid_ack")
    return RadioAck(
      ok = payload.optBoolean("ok", false),
      error = payload.optStringOrNull("error"),
      transmissionId = payload.optStringOrNull("transmissionId"),
      transmitter = parseOperator(payload.optJSONObject("transmitter"))
    )
  }

  fun parseOperator(payload: JSONObject?): RadioOperator? {
    val id = payload?.optStringOrNull("id") ?: return null
    return RadioOperator(id, payload.optStringOrNull("name") ?: "Operador")
  }

  data class RemoteStart(val transmissionId: String, val operator: RadioOperator)

  fun parseRemoteStart(raw: Any?): RemoteStart? {
    val payload = raw as? JSONObject ?: return null
    val transmissionId = payload.optStringOrNull("transmissionId") ?: return null
    val operator = parseOperator(payload.optJSONObject("transmitter")) ?: return null
    return RemoteStart(transmissionId, operator)
  }

  data class RemoteFrame(val transmissionId: String, val sequence: Int, val data: String)

  fun parseRemoteFrame(raw: Any?): RemoteFrame? {
    val payload = raw as? JSONObject ?: return null
    val transmissionId = payload.optStringOrNull("transmissionId") ?: return null
    val data = payload.optStringOrNull("data") ?: return null
    // El backend siempre envia secuencia entera; sin ella el frame no es utilizable.
    if (!payload.has("sequence")) return null
    return RemoteFrame(transmissionId, payload.optInt("sequence", -1), data)
  }

  data class RemoteEnd(val transmissionId: String, val reason: String?)

  fun parseRemoteEnd(raw: Any?): RemoteEnd? {
    val payload = raw as? JSONObject ?: return null
    val transmissionId = payload.optStringOrNull("transmissionId") ?: return null
    return RemoteEnd(transmissionId, payload.optStringOrNull("reason"))
  }

  fun parseServerError(raw: Any?): String =
    (raw as? JSONObject)?.optStringOrNull("message").orEmpty()

  /**
   * `optString` devuelve "" cuando la clave falta, y JSON.stringify omite las
   * claves `undefined`: hay que distinguir ausente de vacio.
   */
  private fun JSONObject.optStringOrNull(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).takeIf { it.isNotBlank() }
  }
}
