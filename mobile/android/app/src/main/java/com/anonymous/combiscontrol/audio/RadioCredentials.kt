package com.anonymous.combiscontrol.audio

/**
 * Identidad de la sesion de Radio dentro del proceso nativo: lo minimo que el
 * servicio necesita para autenticarse contra el backend.
 *
 * NO SE PERSISTE. El servicio es START_NOT_STICKY y React lo reactiva en cada
 * arranque de la app, asi que un token cifrado en disco no tendria consumidor y
 * solo seria superficie de ataque. Vive en memoria mientras dura la sesion y
 * desaparece con el proceso o con `deactivate()`.
 *
 * La autoridad de sesion sigue siendo la de la app en React; esto es un reflejo.
 */
data class RadioSessionCredentials(
  val token: String,
  val userId: String,
  val userName: String,
  val socketUrl: String,
  val authRevision: Long = 0
) {
  val isUsable: Boolean
    get() = token.isNotBlank() && userId.isNotBlank() && socketUrl.isNotBlank()

  /** Nunca expone el token: protege contra registrarlo por accidente. */
  override fun toString(): String =
    "RadioSessionCredentials(userId=$userId, socketUrl=$socketUrl, token=***)"
}
