package com.anonymous.combiscontrol.audio

/**
 * Politica de admision de frames recibidos. Pura y acotada, para poder
 * certificarla en JVM: la cola RX nunca puede crecer sin limite ni aceptar frames
 * de otra transmision.
 *
 * No es un jitter buffer: mantiene la semantica de secuencia contigua que el
 * backend ya exige y prioriza latencia sobre continuidad, que es lo correcto para
 * radio operativa.
 */
class RadioRxQueuePolicy(private val maxDepth: Int = DEFAULT_MAX_DEPTH) {

  enum class Decision {
    /** Escribir el frame en la salida de audio. */
    ACCEPT,

    /** Frame repetido o anterior al esperado: se descarta sin cortar nada. */
    DROP_DUPLICATE,

    /** Frame de otra transmision: no pertenece a esta reproduccion. */
    DROP_FOREIGN,

    /** Hueco de secuencia: se acepta reiniciando, la continuidad ya se perdio. */
    RESYNC,

    /** La salida no drena al ritmo de la red: se descarta para no acumular. */
    DROP_OVERFLOW
  }

  private var transmissionId: String? = null
  private var expectedSequence = 0
  private var depth = 0

  fun begin(nextTransmissionId: String) {
    transmissionId = nextTransmissionId
    expectedSequence = 0
    depth = 0
  }

  fun reset() {
    transmissionId = null
    expectedSequence = 0
    depth = 0
  }

  fun currentTransmissionId(): String? = transmissionId

  fun pendingDepth(): Int = depth

  /** Se invoca cuando la salida de audio consumio un frame. */
  fun onFrameRendered() {
    if (depth > 0) depth -= 1
  }

  fun admit(frameTransmissionId: String, sequence: Int): Decision {
    val active = transmissionId ?: return Decision.DROP_FOREIGN
    if (frameTransmissionId != active) return Decision.DROP_FOREIGN
    if (sequence < expectedSequence) return Decision.DROP_DUPLICATE
    if (depth >= maxDepth) return Decision.DROP_OVERFLOW

    val resync = sequence > expectedSequence
    expectedSequence = sequence + 1
    depth += 1
    return if (resync) Decision.RESYNC else Decision.ACCEPT
  }

  companion object {
    /** 20 frames de 20 ms = 400 ms de audio como maximo en vuelo. */
    const val DEFAULT_MAX_DEPTH = 20
  }
}
