package com.anonymous.combiscontrol.audio

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Contrato Android <-> backend.
 *
 * Los fixtures son copias literales de lo que `backend/src/sockets/index.js`
 * emite hoy, NO de lo que el cliente Kotlin esperaria. Si el backend cambia una
 * clave, este test debe fallar aunque el cliente siga siendo coherente consigo
 * mismo.
 */
class RadioProtocolContractTest {

  // ---------- ACK que el backend construye con acknowledge(ack, payload) ----------

  /** radio:join autorizado. */
  private val joinGranted = JSONObject(
    """{"ok":true,"channelId":"conversation-radio-general","historyRoom":"conversation:conversation-radio-general","liveRoom":"radio:conversation-radio-general","socketId":"abc123"}"""
  )

  /** radio:join sin acceso a la conversacion. */
  private val joinForbidden = JSONObject("""{"ok":false,"error":"forbidden"}""")

  /** radio:start concedido. */
  private val startGranted = JSONObject("""{"ok":true,"transmissionId":"1770000000000-abc123"}""")

  /** radio:start cuando otro socket posee el canal (rama authoritativeOwner). */
  private val startBusyWithOwner = JSONObject(
    """{"ok":false,"error":"channel_busy","channelId":"conversation-radio-general","transmitter":{"id":"user-2","name":"C-03"}}"""
  )

  /** radio:start cuando el propio socket ya transmite en otro canal. */
  private val startBusySelf = JSONObject(
    """{"ok":false,"error":"channel_busy","channelId":"conversation-radio-directo","transmissionId":"1770000000001-abc123","transmitter":{"id":"user-1","name":"Operador"}}"""
  )

  /** radio:start cuando el lock existe pero su valor no era legible: transmitter ausente. */
  private val startBusyWithoutOwner = JSONObject(
    """{"ok":false,"error":"channel_busy","channelId":"conversation-radio-general"}"""
  )

  private val startNotJoined = JSONObject("""{"ok":false,"error":"radio_not_joined"}""")
  private val startUnavailable = JSONObject("""{"ok":false,"error":"radio_unavailable"}""")
  private val endOk = JSONObject("""{"ok":true}""")
  private val endNotActive = JSONObject("""{"ok":false,"error":"transmission_not_active"}""")
  private val leaveChannelRequired = JSONObject("""{"ok":false,"error":"channel_required"}""")

  // ---------- Difusiones ----------

  private val broadcastStart = JSONObject(
    """{"channelId":"conversation-radio-general","transmissionId":"1770000000000-xyz","startedAt":1770000000000,"transmitter":{"id":"user-2","name":"C-03"}}"""
  )
  private val broadcastFrame = JSONObject(
    """{"channelId":"conversation-radio-general","data":"AAAA","sequence":7,"sentAt":1770000000140,"transmissionId":"1770000000000-xyz"}"""
  )
  private val broadcastEnd = JSONObject(
    """{"channelId":"conversation-radio-general","reason":"completed","transmissionId":"1770000000000-xyz"}"""
  )
  private val broadcastEndAuthorityLost = JSONObject(
    """{"channelId":"conversation-radio-general","reason":"authority_lost","transmissionId":"1770000000000-xyz"}"""
  )
  private val serverError = JSONObject(
    """{"message":"El flujo de audio PTT excedio la cadencia permitida."}"""
  )

  @Test
  fun `join ack concedido y denegado`() {
    val granted = RadioProtocol.parseAck(joinGranted)
    assertTrue(granted.ok)
    assertNull(granted.error)

    val forbidden = RadioProtocol.parseAck(joinForbidden)
    assertFalse(forbidden.ok)
    assertEquals("forbidden", forbidden.error)
    // El controlador mapea exactamente este codigo a UNAUTHORIZED.
    assertEquals(RadioSessionReducer.FORBIDDEN, forbidden.error)
  }

  @Test
  fun `start ack concedido entrega el transmissionId del backend`() {
    val granted = RadioProtocol.parseAck(startGranted)
    assertTrue(granted.ok)
    assertEquals("1770000000000-abc123", granted.transmissionId)
    assertNull(granted.transmitter)
  }

  @Test
  fun `start ack ocupado entrega al operador real cuando el backend lo conoce`() {
    val busy = RadioProtocol.parseAck(startBusyWithOwner)
    assertFalse(busy.ok)
    assertEquals(RadioSessionReducer.CHANNEL_BUSY, busy.error)
    assertEquals(RadioOperator("user-2", "C-03"), busy.transmitter)

    val busySelf = RadioProtocol.parseAck(startBusySelf)
    assertEquals(RadioSessionReducer.CHANNEL_BUSY, busySelf.error)
    assertEquals("1770000000001-abc123", busySelf.transmissionId)
  }

  @Test
  fun `start ack ocupado sin transmitter no inventa un operador`() {
    // JSON.stringify omite las claves undefined: el cliente debe tolerar su
    // ausencia en lugar de construir un operador vacio.
    val busy = RadioProtocol.parseAck(startBusyWithoutOwner)
    assertEquals(RadioSessionReducer.CHANNEL_BUSY, busy.error)
    assertNull(busy.transmitter)
  }

  @Test
  fun `errores de start que el cliente debe distinguir`() {
    assertEquals("radio_not_joined", RadioProtocol.parseAck(startNotJoined).error)
    assertEquals("radio_unavailable", RadioProtocol.parseAck(startUnavailable).error)
  }

  @Test
  fun `end ack y su forma idempotente`() {
    assertTrue(RadioProtocol.parseAck(endOk).ok)

    val notActive = RadioProtocol.parseAck(endNotActive)
    assertFalse(notActive.ok)
    assertEquals("transmission_not_active", notActive.error)
  }

  @Test
  fun `leave ack sin canal`() {
    assertEquals("channel_required", RadioProtocol.parseAck(leaveChannelRequired).error)
  }

  @Test
  fun `un ack que no es objeto no puede pasar por exitoso`() {
    assertFalse(RadioProtocol.parseAck(null).ok)
    assertEquals("radio_invalid_ack", RadioProtocol.parseAck(null).error)
    assertFalse(RadioProtocol.parseAck("ok").ok)
  }

  @Test
  fun `difusion de start`() {
    val start = RadioProtocol.parseRemoteStart(broadcastStart)
    assertEquals("1770000000000-xyz", start?.transmissionId)
    assertEquals(RadioOperator("user-2", "C-03"), start?.operator)
  }

  @Test
  fun `difusion de frame conserva secuencia y audio`() {
    val frame = RadioProtocol.parseRemoteFrame(broadcastFrame)
    assertEquals("1770000000000-xyz", frame?.transmissionId)
    assertEquals(7, frame?.sequence)
    assertEquals("AAAA", frame?.data)
  }

  @Test
  fun `difusion de end conserva el motivo del backend`() {
    assertEquals("completed", RadioProtocol.parseRemoteEnd(broadcastEnd)?.reason)
    assertEquals(
      "authority_lost",
      RadioProtocol.parseRemoteEnd(broadcastEndAuthorityLost)?.reason
    )
  }

  @Test
  fun `radio error entrega el mensaje del backend`() {
    assertTrue(RadioProtocol.parseServerError(serverError).contains("cadencia"))
    assertEquals("", RadioProtocol.parseServerError(null))
  }

  // ---------- Lo que el cliente ENVIA debe encajar con lo que el backend lee ----------

  @Test
  fun `join y leave envian solo channelId`() {
    val payload = RadioProtocol.channelPayload("conversation-radio-general")
    assertEquals("conversation-radio-general", payload.getString("channelId"))
    assertEquals(1, payload.length())
  }

  @Test
  fun `end envia channelId y transmissionId`() {
    val payload = RadioProtocol.endPayload("canal-1", "tx-1")
    assertEquals("canal-1", payload.getString("channelId"))
    assertEquals("tx-1", payload.getString("transmissionId"))
    assertEquals(2, payload.length())
  }

  @Test
  fun `el frame lleva exactamente las claves que el backend valida`() {
    // El handler lee payload.channelId, payload.transmissionId, payload.sequence,
    // payload.sentAt y payload.data. Cualquier ausencia lo hace invalid_frame.
    val payload = RadioProtocol.framePayload(
      RadioOutboundFrame(
        channelId = "canal-1",
        transmissionId = "tx-1",
        sequence = 0,
        sentAt = 1770000000000L,
        data = "A".repeat(856)
      )
    )

    assertEquals("canal-1", payload.getString("channelId"))
    assertEquals("tx-1", payload.getString("transmissionId"))
    assertEquals(0, payload.getInt("sequence"))
    assertEquals(1770000000000L, payload.getLong("sentAt"))
    assertEquals(856, payload.getString("data").length)
    assertEquals(5, payload.length())

    // sentAt debe viajar como numero: el backend hace Number(payload.sentAt) y
    // exige Number.isFinite(sentAt) && sentAt > 0.
    assertTrue(payload.get("sentAt") is Number)
    assertTrue(payload.get("sequence") is Number)
  }

  @Test
  fun `la primera secuencia es 0 porque el backend exige lastSequence + 1`() {
    // El backend arranca cada transmision con lastSequence = -1.
    val first = RadioProtocol.framePayload(
      RadioOutboundFrame("canal-1", "tx-1", 0, 1L, "x")
    )
    assertEquals(0, first.getInt("sequence"))
  }

  @Test
  fun `un frame PCM16 de 20 ms produce el largo base64 que el backend exige`() {
    // FRAME_BASE64_LENGTH = ceil(640 / 3) * 4 = 856
    val encoded = java.util.Base64.getEncoder().encodeToString(ByteArray(640))
    assertEquals(856, encoded.length)
    assertEquals(RadioAudioSession.FRAME_BYTES, 640)
  }
}
