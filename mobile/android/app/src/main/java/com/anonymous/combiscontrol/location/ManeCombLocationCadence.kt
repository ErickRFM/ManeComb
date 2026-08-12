package com.anonymous.combiscontrol.location

/**
 * Politica pura de captura Android.
 *
 * LocationManager puede entregar casi al mismo tiempo un fix de GPS y otro de
 * red. La cadencia global evita subir ambos como posiciones distintas. El
 * umbral queda por debajo de la solicitud de 5 s para absorber jitter del
 * scheduler y seguir renovando el lease `live` del backend (8 s).
 */
object ManeCombLocationCadence {
  const val REQUEST_INTERVAL_MS = 5_000L
  const val MIN_PACKET_INTERVAL_MS = 4_000L
  const val PROVIDER_RECOVERY_INTERVAL_MS = 15_000L
  const val MAX_ACCEPTED_ACCURACY_METERS = 120f

  fun shouldEnqueue(
    nowElapsedRealtimeMs: Long,
    lastEnqueuedElapsedRealtimeMs: Long,
    accuracyMeters: Float?
  ): Boolean {
    if (
      accuracyMeters != null &&
      accuracyMeters.isFinite() &&
      accuracyMeters > MAX_ACCEPTED_ACCURACY_METERS
    ) {
      return false
    }

    if (lastEnqueuedElapsedRealtimeMs <= 0L) {
      return true
    }

    return nowElapsedRealtimeMs - lastEnqueuedElapsedRealtimeMs >= MIN_PACKET_INTERVAL_MS
  }
}
