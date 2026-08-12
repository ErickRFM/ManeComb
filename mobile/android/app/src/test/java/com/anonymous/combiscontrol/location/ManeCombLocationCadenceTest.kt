package com.anonymous.combiscontrol.location

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManeCombLocationCadenceTest {
  @Test
  fun `el primer fix valido siempre entra`() {
    assertTrue(ManeCombLocationCadence.shouldEnqueue(10_000L, 0L, 8f))
  }

  @Test
  fun `gps y red no producen dos paquetes en el mismo ciclo`() {
    assertFalse(ManeCombLocationCadence.shouldEnqueue(12_500L, 10_000L, 8f))
    assertTrue(ManeCombLocationCadence.shouldEnqueue(14_000L, 10_000L, 8f))
  }

  @Test
  fun `la cadencia mantiene margen frente al lease live`() {
    assertTrue(ManeCombLocationCadence.REQUEST_INTERVAL_MS < 8_000L)
    assertTrue(ManeCombLocationCadence.MIN_PACKET_INTERVAL_MS < 8_000L)
  }

  @Test
  fun `descarta precision incapaz de representar una ruta confiable`() {
    assertFalse(
      ManeCombLocationCadence.shouldEnqueue(
        20_000L,
        0L,
        ManeCombLocationCadence.MAX_ACCEPTED_ACCURACY_METERS + 1f
      )
    )
    assertTrue(
      ManeCombLocationCadence.shouldEnqueue(
        20_000L,
        0L,
        ManeCombLocationCadence.MAX_ACCEPTED_ACCURACY_METERS
      )
    )
    assertTrue(ManeCombLocationCadence.shouldEnqueue(20_000L, 0L, null))
  }

  @Test
  fun `revisa proveedor antes de que backend declare perdida dura`() {
    assertTrue(ManeCombLocationCadence.PROVIDER_RECOVERY_INTERVAL_MS < 30_000L)
  }
}
