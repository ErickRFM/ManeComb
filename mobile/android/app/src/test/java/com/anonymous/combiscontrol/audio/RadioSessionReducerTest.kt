package com.anonymous.combiscontrol.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Certifica la maquina de estados operativa de Radio en Android. */
class RadioSessionReducerTest {

  private val operator = RadioOperator("user-2", "C-03")
  private val self = RadioOperator("user-1", "Operador")

  private fun reduce(state: RadioSessionState, vararg events: RadioEvent): RadioSessionState =
    events.fold(state) { acc, event -> RadioSessionReducer.reduce(acc, event) }

  private fun listening(): RadioSessionState = reduce(
    RadioSessionState(),
    RadioEvent.Activate("canal-1"),
    RadioEvent.TransportConnected,
    RadioEvent.Joined
  )

  @Test
  fun `listening solo procede del ack de join`() {
    val joining = reduce(RadioSessionState(), RadioEvent.Activate("canal-1"))
    assertEquals(RadioPhase.JOINING, joining.phase)

    val connected = reduce(joining, RadioEvent.TransportConnected)
    assertEquals("conectar el socket no equivale a estar en el canal", RadioPhase.JOINING, connected.phase)

    assertEquals(RadioPhase.LISTENING, reduce(connected, RadioEvent.Joined).phase)
  }

  @Test
  fun `el canal no se pide si lo tiene otro operador`() {
    val receiving = reduce(
      listening(),
      RadioEvent.RemoteTransmissionStarted("tx-remote", operator)
    )
    assertEquals(RadioPhase.RECEIVING, receiving.phase)

    val requested = reduce(receiving, RadioEvent.FloorRequested)
    assertEquals("recibiendo no puede pasar a REQUESTING", RadioPhase.RECEIVING, requested.phase)
  }

  @Test
  fun `transmitir exige el ack del backend`() {
    val requesting = reduce(listening(), RadioEvent.FloorRequested)
    assertEquals(RadioPhase.REQUESTING, requesting.phase)

    // Un FloorGranted sin haber pedido el canal no puede abrir el microfono.
    val forged = reduce(listening(), RadioEvent.FloorGranted("tx-1", self, 10L))
    assertEquals(RadioPhase.LISTENING, forged.phase)
    assertTrue(!forged.capturing)

    val transmitting = reduce(requesting, RadioEvent.FloorGranted("tx-1", self, 10L))
    assertEquals(RadioPhase.TRANSMITTING, transmitting.phase)
    assertEquals("tx-1", transmitting.transmissionId)
    assertEquals(10L, transmitting.transmissionStartedAt)
    assertTrue(transmitting.capturing)
  }

  @Test
  fun `canal ocupado solo lo libera el backend`() {
    val busy = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorDenied(RadioSessionReducer.CHANNEL_BUSY, operator)
    )
    assertEquals(RadioPhase.CHANNEL_BUSY, busy.phase)
    assertEquals(operator, busy.operator)
    assertNull("no guarda el transmissionId ajeno", busy.transmissionId)

    // Cualquier radio:end del canal lo libera, venga del id que venga.
    val freed = reduce(busy, RadioEvent.RemoteTransmissionEnded("tx-desconocido"))
    assertEquals(RadioPhase.LISTENING, freed.phase)
    assertNull(freed.operator)
  }

  @Test
  fun `el backend puede revocar la transmision propia`() {
    val transmitting = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorGranted("tx-1", self, 10L)
    )

    val revoked = reduce(transmitting, RadioEvent.LocalTransmissionEnded("authority_lost"))
    assertEquals(RadioPhase.LISTENING, revoked.phase)
    assertTrue("el microfono debe cerrarse", !revoked.capturing)
    assertEquals("authority_lost", revoked.errorCode)
    assertNull(revoked.transmissionId)
  }

  @Test
  fun `perder el transporte cierra captura y recepcion`() {
    val transmitting = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorGranted("tx-1", self, 10L)
    )
    val dropped = reduce(transmitting, RadioEvent.TransportDisconnected)
    assertEquals(RadioPhase.RECONNECTING, dropped.phase)
    assertTrue(!dropped.capturing)
    assertTrue(!dropped.connected)
    assertNull(dropped.transmissionId)
  }

  @Test
  fun `una llamada tiene prioridad y despues se vuelve a unir`() {
    val transmitting = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorGranted("tx-1", self, 10L)
    )

    val paused = reduce(transmitting, RadioEvent.CallStarted)
    assertEquals(RadioPhase.PAUSED_BY_CALL, paused.phase)
    assertTrue("el microfono no puede compartirse con la llamada", !paused.capturing)

    // Durante la llamada nada del canal puede reactivar audio.
    val duringCall = reduce(paused, RadioEvent.RemoteTransmissionStarted("tx-remote", operator))
    assertEquals(RadioPhase.PAUSED_BY_CALL, duringCall.phase)
    assertTrue(!duringCall.playing)

    val resumed = reduce(paused, RadioEvent.CallEnded)
    assertEquals("vuelve a unirse, no a transmitir", RadioPhase.JOINING, resumed.phase)
  }

  @Test
  fun `el eco de la propia transmision no puede convertirse en recepcion`() {
    val transmitting = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorGranted("tx-1", self, 10L)
    )
    val echoed = reduce(transmitting, RadioEvent.RemoteTransmissionStarted("tx-1", self))
    assertEquals(RadioPhase.TRANSMITTING, echoed.phase)
  }

  @Test
  fun `un frame de otra transmision no altera el estado`() {
    val receiving = reduce(listening(), RadioEvent.RemoteTransmissionStarted("tx-remote", operator))
    val stale = reduce(receiving, RadioEvent.RemoteFrame("tx-vieja", 99L))
    assertNull(stale.lastFrameAt)

    val fresh = reduce(receiving, RadioEvent.RemoteFrame("tx-remote", 99L))
    assertEquals(99L, fresh.lastFrameAt)
  }

  @Test
  fun `join rechazado por permisos deja sesion expirada`() {
    val rejected = reduce(
      reduce(RadioSessionState(), RadioEvent.Activate("canal-1")),
      RadioEvent.JoinRejected(unauthorized = true, code = "forbidden")
    )
    assertEquals(RadioPhase.UNAUTHORIZED, rejected.phase)
    assertEquals("forbidden", rejected.errorCode)
  }

  @Test
  fun `desactivar deja el estado vacio`() {
    val transmitting = reduce(
      listening(),
      RadioEvent.FloorRequested,
      RadioEvent.FloorGranted("tx-1", self, 10L)
    )
    assertEquals(RadioSessionState(), reduce(transmitting, RadioEvent.Deactivate))
  }

  @Test
  fun `cambiar de canal reinicia la sesion operativa`() {
    val receiving = reduce(listening(), RadioEvent.RemoteTransmissionStarted("tx-remote", operator))
    val switched = reduce(receiving, RadioEvent.Activate("canal-2"))

    assertEquals(RadioPhase.JOINING, switched.phase)
    assertEquals("canal-2", switched.channelId)
    assertNull("no arrastra la transmision del canal anterior", switched.transmissionId)
    assertNull(switched.operator)
  }
}
