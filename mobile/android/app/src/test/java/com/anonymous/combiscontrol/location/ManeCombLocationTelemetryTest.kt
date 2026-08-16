package com.anonymous.combiscontrol.location

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ManeCombLocationTelemetryTest {
  @Test
  fun confirmedAttemptKeepsOnePacketTimelineAndComputesRtt() {
    val telemetry = ManeCombLocationTelemetry.confirmedAttempt(
      packetId = "gps-packet-2",
      capturedAt = 1_000L,
      sentAt = 5_000L,
      confirmedAt = 5_240L,
    )

    assertTrue(telemetry.sentAt < telemetry.confirmedAt)
    assertEquals(240L, telemetry.roundTripMs)
    assertEquals("gps-packet-2", telemetry.packetId)
    assertEquals(1_000L, telemetry.capturedAt)
  }

  @Test
  fun queueFlushDoesNotMixAnotherPacketsCaptureTime() {
    val first = ManeCombLocationTelemetry.confirmedAttempt("packet-1", 1_000L, 8_000L, 8_100L)
    val retried = ManeCombLocationTelemetry.confirmedAttempt("packet-2", 2_000L, 9_000L, 9_300L)

    assertEquals(1_000L, first.capturedAt)
    assertEquals(2_000L, retried.capturedAt)
    assertEquals("packet-2", retried.packetId)
  }
}
