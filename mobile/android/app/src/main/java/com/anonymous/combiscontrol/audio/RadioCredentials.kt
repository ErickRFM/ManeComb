package com.anonymous.combiscontrol.audio

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import com.anonymous.combiscontrol.security.ManeCombSecureStore

/**
 * Identidad de la sesion de Radio dentro del proceso nativo. Es lo minimo que el
 * servicio necesita para autenticarse contra el backend: token, quien es el
 * operador y a que servidor conectarse.
 *
 * El token se cifra con AndroidKeystore (misma autoridad que las credenciales de
 * GPS) y nunca se escribe en logs. La autoridad de sesion sigue siendo la de la
 * app en React: aqui solo se refleja para poder sobrevivir a que el runtime JS
 * este suspendido.
 */
data class RadioSessionCredentials(
  val token: String,
  val userId: String,
  val userName: String,
  val socketUrl: String
) {
  val isUsable: Boolean
    get() = token.isNotBlank() && userId.isNotBlank() && socketUrl.isNotBlank()
}

object RadioCredentials {
  private const val TAG = "ManeCombRadioCreds"
  private const val PREFS_NAME = "manecomb-radio-service"
  private const val KEY_ALIAS = "manecomb-radio-credentials-v1"
  private const val KEY_TOKEN_ENCRYPTED = "tokenEncrypted"
  private const val KEY_USER_ID = "userId"
  private const val KEY_USER_NAME = "userName"
  private const val KEY_SOCKET_URL = "socketUrl"

  fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  fun write(context: Context, credentials: RadioSessionCredentials): Boolean {
    return try {
      prefs(context).edit()
        .putString(KEY_TOKEN_ENCRYPTED, ManeCombSecureStore.encrypt(KEY_ALIAS, credentials.token))
        .putString(KEY_USER_ID, credentials.userId)
        .putString(KEY_USER_NAME, credentials.userName)
        .putString(KEY_SOCKET_URL, credentials.socketUrl)
        .apply()
      true
    } catch (error: Exception) {
      // Sin credenciales utilizables es preferible dejar Radio inactivo que
      // guardar un token en claro.
      Log.e(TAG, "Could not encrypt Radio credentials; native session disabled.", error)
      clear(context)
      false
    }
  }

  fun read(context: Context): RadioSessionCredentials? {
    val preferences = prefs(context)
    val encryptedToken = preferences.getString(KEY_TOKEN_ENCRYPTED, "").orEmpty()
    if (encryptedToken.isBlank()) return null

    return try {
      val credentials = RadioSessionCredentials(
        token = ManeCombSecureStore.decrypt(KEY_ALIAS, encryptedToken),
        userId = preferences.getString(KEY_USER_ID, "").orEmpty(),
        userName = preferences.getString(KEY_USER_NAME, "").orEmpty(),
        socketUrl = preferences.getString(KEY_SOCKET_URL, "").orEmpty()
      )
      if (credentials.isUsable) credentials else null
    } catch (error: Exception) {
      Log.e(TAG, "Could not decrypt Radio credentials.", error)
      clear(context)
      null
    }
  }

  /** Logout / cambio de cuenta: no puede quedar identidad fantasma en el proceso. */
  fun clear(context: Context) {
    prefs(context).edit()
      .remove(KEY_TOKEN_ENCRYPTED)
      .remove(KEY_USER_ID)
      .remove(KEY_USER_NAME)
      .remove(KEY_SOCKET_URL)
      .apply()
  }
}
