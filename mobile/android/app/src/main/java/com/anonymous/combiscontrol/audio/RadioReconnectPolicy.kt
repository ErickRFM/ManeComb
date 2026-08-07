package com.anonymous.combiscontrol.audio

import kotlin.math.min
import kotlin.random.Random

/**
 * Unico algoritmo de reconexion de Radio. Existe aqui, no en JavaScript ni
 * repartido en temporizadores de React: la sesion vive en el servicio nativo y su
 * recuperacion tambien.
 *
 * Backoff exponencial acotado con jitter pequenio, para que muchas terminales que
 * pierden red a la vez no vuelvan sincronizadas contra el backend.
 */
class RadioReconnectPolicy(
  private val baseDelayMs: Long = 800,
  private val maxDelayMs: Long = 15000,
  private val jitterRatio: Double = 0.2,
  private val random: Random = Random.Default
) {
  private var attempt = 0

  fun reset() {
    attempt = 0
  }

  fun attempts(): Int = attempt

  /**
   * @return retardo del siguiente intento. Nunca crece sin limite ni devuelve 0,
   *   para no producir una tormenta de reconexion contra el backend.
   */
  fun nextDelayMs(): Long {
    val exponential = baseDelayMs.toDouble() * Math.pow(2.0, attempt.toDouble())
    attempt = min(attempt + 1, MAX_ATTEMPT_EXPONENT)
    val capped = min(exponential, maxDelayMs.toDouble())
    val jitter = capped * jitterRatio * (random.nextDouble() * 2 - 1)
    return (capped + jitter).toLong().coerceIn(MIN_DELAY_MS, maxDelayMs)
  }

  /**
   * Un fallo de autenticacion no se reintenta a ciegas: el operador debe volver a
   * iniciar sesion. Reintentar solo quemaria bateria y red.
   */
  fun shouldRetry(reason: RadioDisconnectReason): Boolean = when (reason) {
    RadioDisconnectReason.NETWORK -> true
    RadioDisconnectReason.SERVER -> true
    RadioDisconnectReason.UNAUTHORIZED -> false
    RadioDisconnectReason.MANUAL -> false
  }

  companion object {
    private const val MIN_DELAY_MS = 250L
    private const val MAX_ATTEMPT_EXPONENT = 6
  }
}

enum class RadioDisconnectReason {
  /** Perdida de red o del transporte. */
  NETWORK,

  /** El servidor cerro la conexion. */
  SERVER,

  /** Token invalido o expirado. */
  UNAUTHORIZED,

  /** Desactivacion explicita: logout, llamada, apagado del servicio. */
  MANUAL
}
