package com.anonymous.combiscontrol.audio

import android.util.Log

/**
 * Traza estructurada del subsistema Radio, pensada para diagnosticar el primer
 * telefono sin exponer secretos.
 *
 * Un unico tag (`ManeCombRadio`) para poder filtrar la sesion completa con
 * `adb logcat -s ManeCombRadio:I`.
 *
 * Prohibido registrar: token, credenciales, audio base64 o cualquier contenido de
 * frame. Solo identificadores operativos y codigos de error.
 */
object RadioLog {
  const val TAG = "ManeCombRadio"

  /** Claves cuyo valor nunca puede escribirse, aunque alguien las pase por error. */
  private val FORBIDDEN_KEYS = setOf("token", "auth", "data", "audio", "password", "secret")

  fun event(name: String, vararg fields: Pair<String, Any?>) {
    Log.i(TAG, format(name, fields.toList()))
  }

  fun warn(name: String, vararg fields: Pair<String, Any?>) {
    Log.w(TAG, format(name, fields.toList()))
  }

  fun error(name: String, error: Throwable?, vararg fields: Pair<String, Any?>) {
    // Se registra el tipo de excepcion, no su mensaje: un mensaje de red puede
    // arrastrar la URL con credenciales embebidas.
    val withType: List<Pair<String, Any?>> =
      fields.toList() + ("errorType" to error?.javaClass?.simpleName)
    Log.e(TAG, format(name, withType))
  }

  private fun format(name: String, fields: List<Pair<String, Any?>>): String {
    if (fields.isEmpty()) return name
    val rendered = fields
      .filter { (key, value) -> value != null && key.lowercase() !in FORBIDDEN_KEYS }
      .joinToString(" ") { (key, value) -> "$key=$value" }
    return if (rendered.isEmpty()) name else "$name $rendered"
  }
}
