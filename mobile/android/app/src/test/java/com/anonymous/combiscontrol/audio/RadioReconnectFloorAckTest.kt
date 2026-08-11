package com.anonymous.combiscontrol.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RadioReconnectFloorAckTest {

  private class FakeTransport : RadioTransport {
    var listener: RadioTransportListener? = null
    var connectCount = 0
    var pendingJoin: ((RadioAck) -> Unit)? = null
    var pendingFloor: ((RadioAck) -> Unit)? = null
    val endedFloors = mutableListOf<Pair<String, String>>()

    override fun connect(credentials: RadioSessionCredentials) {
      connectCount += 1
    }

    override fun disconnect() = Unit

    override fun join(channelId: String, ack: (RadioAck) -> Unit) {
      pendingJoin = ack
    }

    override fun leave(channelId: String) = Unit

    override fun requestFloor(channelId: String, ack: (RadioAck) -> Unit) {
      pendingFloor = ack
    }

    override fun sendFrame(frame: RadioOutboundFrame): Boolean = true

    override fun endFloor(channelId: String, transmissionId: String, ack: (RadioAck) -> Unit) {
      endedFloors += channelId to transmissionId
      ack(RadioAck(ok = true))
    }

    override fun setListener(listener: RadioTransportListener?) {
      this.listener = listener
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
  }

  private class FakeAudio : RadioAudioEngine {
    var captureStarts = 0
    var capturing = false

    override fun startCapture(): Boolean {
      captureStarts += 1
      capturing = true
      return true
    }

    override fun stopCapture() {
      capturing = false
    }

    override fun startPlayback(transmissionId: String): Boolean = true

    override fun enqueueFrame(transmissionId: String, sequence: Int, base64Data: String): Boolean = true

    override fun stopPlayback() = Unit

    override fun releaseAudio() {
      capturing = false
    }
  }

  private class ManualScheduler : RadioScheduler {
    private var pending: (() -> Unit)? = null

    override fun postDelayed(delayMs: Long, action: () -> Unit): RadioCancellable {
      pending = action
      return object : RadioCancellable {
        override fun cancel() {
          if (pending === action) pending = null
        }
      }
    }

    fun runPending() {
      val action = pending
      pending = null
      action?.invoke()
    }
  }

  @Test
  fun `floor concedido tarde tras reconexion se devuelve sin abrir microfono`() {
    val transport = FakeTransport()
    val audio = FakeAudio()
    val scheduler = ManualScheduler()
    val controller = RadioSessionController(
      transport = transport,
      audio = audio,
      scheduler = scheduler,
      reconnectPolicy = RadioReconnectPolicy(baseDelayMs = 1, maxDelayMs = 1, jitterRatio = 0.0),
      onStateChanged = { }
    )
    val credentials = RadioSessionCredentials(
      token = "token-1",
      userId = "user-1",
      userName = "Operador",
      socketUrl = "https://backend.test"
    )

    controller.activate(credentials, "canal-1")
    transport.listener?.onConnected()
    transport.completeJoin(RadioAck(ok = true))
    assertEquals(RadioPhase.LISTENING, controller.snapshot().phase)

    controller.requestTransmission()
    assertEquals(RadioPhase.REQUESTING, controller.snapshot().phase)
    assertTrue(transport.pendingFloor != null)

    transport.listener?.onDisconnected(RadioDisconnectReason.NETWORK)
    assertEquals(RadioPhase.RECONNECTING, controller.snapshot().phase)
    assertFalse(audio.capturing)

    scheduler.runPending()
    assertEquals(2, transport.connectCount)
    transport.listener?.onConnected()
    transport.completeJoin(RadioAck(ok = true))
    assertEquals(RadioPhase.LISTENING, controller.snapshot().phase)

    transport.completeFloor(RadioAck(ok = true, transmissionId = "tx-tardia"))

    assertEquals("la reconexion vuelve solo a escucha", RadioPhase.LISTENING, controller.snapshot().phase)
    assertEquals("un ACK viejo nunca puede abrir el microfono", 0, audio.captureStarts)
    assertFalse(audio.capturing)
    assertEquals(listOf("canal-1" to "tx-tardia"), transport.endedFloors)
  }
}
