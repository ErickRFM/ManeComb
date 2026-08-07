package com.anonymous.combiscontrol.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class RadioReconnectPolicyTest {

  @Test
  fun `el backoff crece y queda acotado`() {
    val policy = RadioReconnectPolicy(
      baseDelayMs = 1000,
      maxDelayMs = 8000,
      jitterRatio = 0.0,
      random = Random(1)
    )

    assertEquals(1000L, policy.nextDelayMs())
    assertEquals(2000L, policy.nextDelayMs())
    assertEquals(4000L, policy.nextDelayMs())
    assertEquals(8000L, policy.nextDelayMs())
    // El techo impide que un corte largo empuje el reintento a minutos.
    assertEquals(8000L, policy.nextDelayMs())
    assertEquals(8000L, policy.nextDelayMs())
  }

  @Test
  fun `el jitter mantiene el retardo dentro del limite`() {
    val policy = RadioReconnectPolicy(baseDelayMs = 1000, maxDelayMs = 5000, jitterRatio = 0.3)
    repeat(20) {
      val delay = policy.nextDelayMs()
      assertTrue("nunca reintenta de inmediato", delay >= 250L)
      assertTrue("nunca supera el techo", delay <= 5000L)
    }
  }

  @Test
  fun `reset devuelve al primer intento`() {
    val policy = RadioReconnectPolicy(baseDelayMs = 1000, maxDelayMs = 8000, jitterRatio = 0.0)
    policy.nextDelayMs()
    policy.nextDelayMs()
    policy.reset()
    assertEquals(0, policy.attempts())
    assertEquals(1000L, policy.nextDelayMs())
  }

  @Test
  fun `un fallo de autenticacion no se reintenta`() {
    val policy = RadioReconnectPolicy()
    assertTrue(policy.shouldRetry(RadioDisconnectReason.NETWORK))
    assertTrue(policy.shouldRetry(RadioDisconnectReason.SERVER))
    assertFalse("reintentar con token invalido solo quema bateria", policy.shouldRetry(RadioDisconnectReason.UNAUTHORIZED))
    assertFalse("una desactivacion explicita no se deshace sola", policy.shouldRetry(RadioDisconnectReason.MANUAL))
  }
}

class RadioRxQueuePolicyTest {

  @Test
  fun `acepta la secuencia contigua de la transmision activa`() {
    val policy = RadioRxQueuePolicy()
    policy.begin("tx-1")

    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 0))
    policy.onFrameRendered()
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 1))
    policy.onFrameRendered()
  }

  @Test
  fun `descarta frames repetidos sin cortar la reproduccion`() {
    val policy = RadioRxQueuePolicy()
    policy.begin("tx-1")
    policy.admit("tx-1", 0)
    policy.onFrameRendered()

    assertEquals(RadioRxQueuePolicy.Decision.DROP_DUPLICATE, policy.admit("tx-1", 0))
  }

  @Test
  fun `un hueco de red resincroniza en lugar de bloquear`() {
    val policy = RadioRxQueuePolicy()
    policy.begin("tx-1")
    policy.admit("tx-1", 0)
    policy.onFrameRendered()

    // Radio operativa prioriza latencia: se sigue reproduciendo tras la perdida.
    assertEquals(RadioRxQueuePolicy.Decision.RESYNC, policy.admit("tx-1", 5))
    policy.onFrameRendered()
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 6))
  }

  @Test
  fun `ignora frames de otra transmision`() {
    val policy = RadioRxQueuePolicy()
    policy.begin("tx-1")
    assertEquals(RadioRxQueuePolicy.Decision.DROP_FOREIGN, policy.admit("tx-2", 0))

    policy.reset()
    assertEquals(RadioRxQueuePolicy.Decision.DROP_FOREIGN, policy.admit("tx-1", 0))
  }

  @Test
  fun `la cola esta acotada y nunca crece sin limite`() {
    val policy = RadioRxQueuePolicy(maxDepth = 3)
    policy.begin("tx-1")

    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 0))
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 1))
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 2))
    assertEquals(
      "la salida no drena: se descarta en vez de acumular memoria",
      RadioRxQueuePolicy.Decision.DROP_OVERFLOW,
      policy.admit("tx-1", 3)
    )
    assertEquals(3, policy.pendingDepth())

    policy.onFrameRendered()
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-1", 3))
  }

  @Test
  fun `begin reinicia la secuencia esperada`() {
    val policy = RadioRxQueuePolicy()
    policy.begin("tx-1")
    policy.admit("tx-1", 0)
    policy.onFrameRendered()

    policy.begin("tx-2")
    assertEquals("tx-2", policy.currentTransmissionId())
    assertEquals(RadioRxQueuePolicy.Decision.ACCEPT, policy.admit("tx-2", 0))
  }
}
