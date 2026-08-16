package com.anonymous.combiscontrol.location

data class ManeCombPacketTelemetry(
  val packetId: String,
  val capturedAt: Long,
  val sentAt: Long,
  val confirmedAt: Long,
) {
  val roundTripMs: Long = (confirmedAt - sentAt).coerceAtLeast(0L)
}

object ManeCombLocationTelemetry {
  fun confirmedAttempt(
    packetId: String,
    capturedAt: Long,
    sentAt: Long,
    confirmedAt: Long,
  ): ManeCombPacketTelemetry {
    require(packetId.isNotBlank()) { "packetId is required" }
    require(capturedAt > 0L) { "capturedAt is required" }
    require(sentAt >= capturedAt) { "sentAt cannot precede capturedAt" }
    require(confirmedAt >= sentAt) { "confirmedAt cannot precede sentAt" }
    return ManeCombPacketTelemetry(packetId, capturedAt, sentAt, confirmedAt)
  }
}
