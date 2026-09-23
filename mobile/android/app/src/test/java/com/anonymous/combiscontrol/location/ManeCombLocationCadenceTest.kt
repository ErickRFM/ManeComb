package com.anonymous.combiscontrol.location

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ManeCombLocationCadenceTest {
  @Test
  fun `la edad GPS monotónica resiste reloj menos quince y mas quince minutos`() {
    val capturedWall = 1_000_000L
    val capturedElapsed = 20_000L
    for (wallNow in listOf(capturedWall - 900_000L, capturedWall + 900_000L)) {
      val result = decideGpsQueueAge(
        capturedWall, capturedElapsed, 15, wallNow,
        capturedElapsed + 600_000L, 15, 86_400_000L
      )
      assertTrue(result.isMonotonic)
      assertTrue(result.source == "monotonic")
      assertTrue(result.ageMs == 600_000L)
    }
  }

  @Test
  fun `process death mismo boot mantiene continuidad pero reboot o legacy no`() {
    val continuous = decideGpsQueueAge(1_000_000L, 25_000L, 7, 1_600_000L, 625_000L, 7, 86_400_000L)
    assertTrue(continuous.isMonotonic)
    assertTrue(continuous.ageMs == 600_000L)

    for (boundary in listOf(
      decideGpsQueueAge(1_000_000L, 25_000L, 7, 1_600_000L, 10_000L, 8, 86_400_000L),
      decideGpsQueueAge(1_000_000L, -1L, -1, 1_600_000L, 625_000L, 7, 86_400_000L),
      decideGpsQueueAge(1_000_000L, 25_000L, -1, 1_600_000L, 625_000L, -1, 86_400_000L)
    )) {
      assertFalse(boundary.isMonotonic)
      assertTrue(boundary.source == "wall_clock_fallback")
      assertTrue(boundary.ageMs == 600_000L)
    }
  }

  @Test
  fun `un reloj wall clock retrocedido no genera edad negativa ni origen monotónico falso`() {
    val fallback = decideGpsQueueAge(1_000_000L, 25_000L, 1, 100_000L, 10_000L, 2, 86_400_000L)
    assertFalse(fallback.isMonotonic)
    assertTrue(fallback.ageMs == 0L)
    assertTrue(fallback.source == "wall_clock_fallback")
  }

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
