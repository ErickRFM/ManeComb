package com.anonymous.combiscontrol.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Certifica la sesion de Radio nativa completa con transporte, audio y reloj
 * falsos. Cubre justamente los casos en los que React no puede intervenir.
 */
class RadioSessionControllerTest {

  private val credentials = RadioSessionCredentials(
    token = "token-1",
    userId = "user-1",
    userName = "Operador",
    socketUrl = "https://backend.test"
  )
  private val remote = RadioOperator("user-2", "C-03")

  private class FakeTransport : RadioTransport {
    var events: RadioTransportListener? = null
    var connectCount = 0
    var disconnectCount = 0
    val joined = mutableListOf<String>()
    val left = mutableListOf<String>()
    val frames = mutableListOf<RadioOutboundFrame>()
    val endedFloors = mutableListOf<Pair<String, String>>()
    var frameSendResult = true
    private var pendingJoin: ((RadioAck) -> Unit)? = null
    private var pendingFloor: ((RadioAck) -> Unit)? = null

    override fun connect(credentials: RadioSessionCredentials) { connectCount += 1 }
    override fun disconnect() { disconnectCount += 1 }
    override fun setListener(listener: RadioTransportListener?) { events = listener }

    override fun join(channelId: String, ack: (RadioAck) -> Unit) {
      joined += channelId
      pendingJoin = ack
    }

    override fun leave(channelId: String) { left += channelId }

    override fun requestFloor(channelId: String, ack: (RadioAck) -> Unit) {
      pendingFloor = ack
    }

    override fun sendFrame(frame: RadioOutboundFrame): Boolean {
      if (!frameSendResult) return false
      frames += frame
      return true
    }

    override fun endFloor(channelId: String, transmissionId: String, ack: (RadioAck) -> Unit) {
      endedFloors += channelId to transmissionId
      ack(RadioAck(ok = true))
    }

    fun completeJoin(ack: RadioAck) {
      val callback = pendingJoin
      pendingJoin = null
      callback?.invoke(ack)
    }

    fun completeFloor(ack: RadioAck) {
      val callback = pendingFloor
      pendingFloor = null
      callback?.invoke(ack)
    }

    fun hasPendingFloor(): Boolean = pendingFloor != null
  }

  private class FakeAudio : RadioAudioEngine {
    var capturing = false
    var playingTransmissionId: String? = null
    var captureStartResult = true
    val enqueued = mutableListOf<Pair<String, Int>>()
    var releaseCount = 0

    override fun startCapture(): Boolean {
      if (!captureStartResult) return false
      capturing = true
      return true
    }

    override fun stopCapture() { capturing = false }

    override fun startPlayback(transmissionId: String): Boolean {
      playingTransmissionId = transmissionId
      return true
    }

    override fun enqueueFrame(transmissionId: String, sequence: Int, base64Data: String): Boolean {
      enqueued += transmissionId to sequence
      return true
    }

    override fun stopPlayback() { playingTransmissionId = null }

    override fun releaseAudio() {
      releaseCount += 1
      capturing = false
      playingTransmissionId = null
    }
  }

  private class ManualScheduler : RadioScheduler {
    private var pending: (() -> Unit)? = null
    var scheduledDelayMs: Long? = null
    var cancelCount = 0

    override fun postDelayed(delayMs: Long, action: () -> Unit): RadioCancellable {
      scheduledDelayMs = delayMs
      pending = action
      return object : RadioCancellable {
        override fun cancel() {
          cancelCount += 1
          if (pending === action) pending = null
        }
      }
    }

    fun hasPending(): Boolean = pending != null

    fun runPending() {
      val action = pending
      pending = null
      action?.invoke()
    }
  }

  private class Harness {
    val transport = FakeTransport()
    val audio = FakeAudio()
    val scheduler = ManualScheduler()
    var now = 1_000L
    val states = mutableListOf<RadioSessionState>()
    val controller = RadioSessionController(
      transport = transport,
      audio = audio,
      scheduler = scheduler,
      reconnectPolicy = RadioReconnectPolicy(baseDelayMs = 400, maxDelayMs = 1600, jitterRatio = 0.0),
      clock = { now },
      onStateChanged = { states += it }
    )

    fun phase(): RadioPhase = controller.snapshot().phase
  }

  private fun listeningHarness(): Harness {
    val harness = Harness()
    harness.controller.activate(
      RadioSessionCredentials("token-1", "user-1", "Operador", "https://backend.test"),
      "canal-1"
    )
    harness.transport.events?.onConnected()
    harness.transport.completeJoin(RadioAck(ok = true))
    return harness
  }

  private fun transmittingHarness(): Harness {
    val harness = listeningHarness()
    harness.controller.requestTransmission()
    harness.transport.completeFloor(RadioAck(ok = true, transmissionId = "tx-1"))
    return harness
  }

  @Test
  fun `activate conecta y se une solo tras el ack`() {
    val harness = Harness()
    harness.controller.activate(credentials, "canal-1")

    assertEquals(1, harness.transport.connectCount)
    assertEquals(RadioPhase.JOINING, harness.phase())

    harness.transport.events?.onConnected()
    assertEquals(listOf("canal-1"), harness.transport.joined)
    assertEquals("conectado no es unido", RadioPhase.JOINING, harness.phase())

    harness.transport.completeJoin(RadioAck(ok = true))
    assertEquals(RadioPhase.LISTENING, harness.phase())
  }

  @Test
  fun `join sin permisos deja sesion expirada y no reintenta`() {
    val harness = Harness()
    harness.controller.activate(credentials, "canal-1")
    harness.transport.events?.onConnected()
    harness.transport.completeJoin(RadioAck(ok = false, error = "forbidden"))

    assertEquals(RadioPhase.UNAUTHORIZED, harness.phase())
    assertFalse("no se reintenta un rechazo de permisos", harness.scheduler.hasPending())
  }

  @Test
  fun `el turno concedido abre el microfono y los frames van al socket`() {
    val harness = transmittingHarness()

    assertEquals(RadioPhase.TRANSMITTING, harness.phase())
    assertTrue(harness.audio.capturing)

    harness.controller.onFrameCaptured("AAAA", 0, 1_234L)
    harness.controller.onFrameCaptured("BBBB", 1, 1_254L)

    assertEquals(2, harness.transport.frames.size)
    assertEquals("canal-1", harness.transport.frames[0].channelId)
    assertEquals("tx-1", harness.transport.frames[0].transmissionId)
    assertEquals(1, harness.transport.frames[1].sequence)
  }

  @Test
  fun `canal ocupado no abre el microfono`() {
    val harness = listeningHarness()
    harness.controller.requestTransmission()
    assertEquals(RadioPhase.REQUESTING, harness.phase())

    harness.transport.completeFloor(
      RadioAck(ok = false, error = "channel_busy", transmitter = remote)
    )

    assertEquals(RadioPhase.CHANNEL_BUSY, harness.phase())
    assertFalse(harness.audio.capturing)
    assertEquals(remote, harness.controller.snapshot().operator)
  }

  @Test
  fun `si el microfono falla se libera el canal concedido`() {
    val harness = listeningHarness()
    harness.audio.captureStartResult = false

    harness.controller.requestTransmission()
    harness.transport.completeFloor(RadioAck(ok = true, transmissionId = "tx-1"))

    assertFalse(harness.audio.capturing)
    assertEquals(listOf("canal-1" to "tx-1"), harness.transport.endedFloors)
    assertEquals(RadioPhase.LISTENING, harness.phase())
  }

  @Test
  fun `el backend puede revocar la transmision con react congelado`() {
    val harness = transmittingHarness()

    harness.transport.events?.onRemoteTransmissionEnded("tx-1", "authority_lost")

    assertFalse("el microfono se cierra sin intervencion de la UI", harness.audio.capturing)
    assertEquals(RadioPhase.LISTENING, harness.phase())
    assertEquals("authority_lost", harness.controller.snapshot().errorCode)
  }

  @Test
  fun `perder el socket durante TX cierra captura y programa reconexion`() {
    val harness = transmittingHarness()

    harness.transport.events?.onDisconnected(RadioDisconnectReason.NETWORK)

    assertFalse(harness.audio.capturing)
    assertEquals(RadioPhase.RECONNECTING, harness.phase())
    assertEquals(400L, harness.scheduler.scheduledDelayMs)

    harness.scheduler.runPending()
    assertEquals("reconecta", 2, harness.transport.connectCount)

    harness.transport.events?.onConnected()
    harness.transport.completeJoin(RadioAck(ok = true))
    assertEquals("vuelve a escuchar, nunca a transmitir", RadioPhase.LISTENING, harness.phase())
    assertFalse(harness.audio.capturing)
  }

  @Test
  fun `un socket caido sin frames entregables corta la captura`() {
    val harness = transmittingHarness()
    harness.transport.frameSendResult = false

    harness.controller.onFrameCaptured("AAAA", 0, 1_234L)

    assertFalse(harness.audio.capturing)
    assertEquals(RadioPhase.LISTENING, harness.phase())
    assertEquals("radio_frame_transport_lost", harness.controller.snapshot().errorCode)
  }

  @Test
  fun `token invalido no entra en bucle de reconexion`() {
    val harness = listeningHarness()

    harness.transport.events?.onDisconnected(RadioDisconnectReason.UNAUTHORIZED)

    assertEquals(RadioPhase.UNAUTHORIZED, harness.phase())
    assertFalse(harness.scheduler.hasPending())
  }

  @Test
  fun `la recepcion reproduce sin pasar frames por react`() {
    val harness = listeningHarness()

    harness.transport.events?.onRemoteTransmissionStarted("tx-remote", remote)
    assertEquals(RadioPhase.RECEIVING, harness.phase())
    assertEquals("tx-remote", harness.audio.playingTransmissionId)

    val publicationsAfterStart = harness.states.size
    repeat(200) { sequence ->
      harness.now = 1_000L + sequence
      harness.transport.events?.onRemoteFrame("tx-remote", sequence, "AAAA")
    }

    assertEquals(200, harness.audio.enqueued.size)
    assertEquals(
      "los paquetes PCM permanecen en nativo y no pueden saturar el hilo JS",
      publicationsAfterStart,
      harness.states.size
    )
    assertEquals(1_199L, harness.controller.snapshot().lastFrameAt)

    harness.transport.events?.onRemoteTransmissionEnded("tx-remote", null)
    assertEquals(RadioPhase.LISTENING, harness.phase())
    assertNull(harness.audio.playingTransmissionId)
    assertEquals("inicio y fin siguen publicados a la UI", publicationsAfterStart + 1, harness.states.size)
  }

  @Test
  fun `el eco de la propia transmision no se reproduce`() {
    val harness = transmittingHarness()

    harness.transport.events?.onRemoteTransmissionStarted(
      "tx-1",
      RadioOperator("user-1", "Operador")
    )

    assertNull("no puede reproducirse a si mismo", harness.audio.playingTransmissionId)
    assertEquals(RadioPhase.TRANSMITTING, harness.phase())
  }

  @Test
  fun `cambiar de canal durante TX libera el canal anterior`() {
    val harness = transmittingHarness()

    harness.controller.selectChannel("canal-2")

    assertFalse(harness.audio.capturing)
    assertEquals(listOf("canal-1" to "tx-1"), harness.transport.endedFloors)
    assertEquals(listOf("canal-1"), harness.transport.left)
    assertEquals("canal-2", harness.controller.snapshot().channelId)
    assertEquals(RadioPhase.JOINING, harness.phase())
  }

  @Test
  fun `un turno concedido tarde tras cambiar de canal se devuelve`() {
    val harness = listeningHarness()
    harness.controller.requestTransmission()
    assertTrue(harness.transport.hasPendingFloor())

    harness.controller.selectChannel("canal-2")
    harness.transport.completeFloor(RadioAck(ok = true, transmissionId = "tx-tardio"))

    assertFalse("no abre el microfono en el canal equivocado", harness.audio.capturing)
    assertTrue(
      "libera el canal anterior",
      harness.transport.endedFloors.contains("canal-1" to "tx-tardio")
    )
    assertEquals("canal-2", harness.controller.snapshot().channelId)
  }

  @Test
  fun `una llamada suspende radio y despues vuelve a unirse`() {
    val harness = transmittingHarness()

    harness.controller.onCallStarted()
    assertEquals(RadioPhase.PAUSED_BY_CALL, harness.phase())
    assertFalse("el microfono no se comparte con la llamada", harness.audio.capturing)
    assertTrue(harness.transport.endedFloors.contains("canal-1" to "tx-1"))

    harness.controller.onCallEnded()
    assertEquals(RadioPhase.JOINING, harness.phase())
    harness.transport.completeJoin(RadioAck(ok = true))
    assertEquals(RadioPhase.LISTENING, harness.phase())
    assertFalse("nunca restaura la transmision perdida", harness.audio.capturing)
  }

  @Test
  fun `logout destruye socket canal captura e identidad`() {
    val harness = transmittingHarness()

    harness.controller.deactivate()

    assertEquals(RadioPhase.IDLE, harness.phase())
    assertFalse(harness.audio.capturing)
    assertTrue(harness.audio.releaseCount > 0)
    assertEquals(listOf("canal-1"), harness.transport.left)
    assertEquals(1, harness.transport.disconnectCount)
    assertNull(harness.controller.snapshot().channelId)

    // Sin sesion activa, una caida de red no reconecta nada.
    harness.transport.events?.onDisconnected(RadioDisconnectReason.NETWORK)
    assertFalse(harness.scheduler.hasPending())
  }

  @Test
  fun `activar el mismo canal dos veces no duplica la sesion`() {
    val harness = listeningHarness()

    harness.controller.activate(credentials, "canal-1")

    assertEquals("no reconecta", 1, harness.transport.connectCount)
    assertEquals("no vuelve a unirse", 1, harness.transport.joined.size)
    assertEquals(RadioPhase.LISTENING, harness.phase())
  }

  @Test
  fun `si el backend dice que no estamos en la sala el cliente se reincorpora`() {
    val harness = listeningHarness()
    assertEquals(1, harness.transport.joined.size)

    harness.controller.requestTransmission()
    harness.transport.completeFloor(RadioAck(ok = false, error = "radio_not_joined"))

    // Sin esto el operador quedaria en LISTENING sin poder transmitir nunca.
    assertEquals(2, harness.transport.joined.size)
    harness.transport.completeJoin(RadioAck(ok = true))
    assertEquals(RadioPhase.LISTENING, harness.phase())
  }

  @Test
  fun `todo punto de entrada pasa por el confinamiento de hilo`() {
    // El estado se toca desde el hilo de React, el de Socket.IO y el de captura.
    // Si algun punto de entrada no se confinara, habria carrera de datos.
    val transport = FakeTransport()
    val audio = FakeAudio()
    val pending = ArrayDeque<() -> Unit>()
    val controller = RadioSessionController(
      transport = transport,
      audio = audio,
      scheduler = ManualScheduler(),
      confine = { action -> pending.addLast(action) },
      onStateChanged = {}
    )

    controller.activate(credentials, "canal-1")
    assertEquals("nada se ejecuta fuera del hilo de sesion", 0, transport.connectCount)
    assertEquals(RadioPhase.IDLE, controller.snapshot().phase)

    while (pending.isNotEmpty()) pending.removeFirst().invoke()
    assertEquals(1, transport.connectCount)
    assertEquals(RadioPhase.JOINING, controller.snapshot().phase)

    transport.events?.onConnected()
    controller.onFrameCaptured("AAAA", 0, 1L)
    controller.onAudioFailure("ptt_capture_read_failed")
    transport.events?.onDisconnected(RadioDisconnectReason.NETWORK)
    assertEquals("los eventos externos tampoco se ejecutan en su hilo", 4, pending.size)
  }

  @Test
  fun `un join fallido por red programa reconexion acotada`() {
    val harness = Harness()
    harness.controller.activate(credentials, "canal-1")
    harness.transport.events?.onConnected()
    harness.transport.completeJoin(RadioAck(ok = false, error = "radio_ack_timeout"))

    assertEquals(RadioPhase.ERROR, harness.phase())
    assertTrue(harness.scheduler.hasPending())
    assertEquals(400L, harness.scheduler.scheduledDelayMs)
  }
}
