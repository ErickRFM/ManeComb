package com.anonymous.combiscontrol.location

import android.content.SharedPreferences
import android.util.Log
import com.anonymous.combiscontrol.security.ManeCombSecureStore

/**
 * Credenciales de GPS en segundo plano. La cripto vive en ManeCombSecureStore;
 * aqui solo queda la persistencia y la migracion desde instalaciones previas a M1.
 * El alias de clave no cambia: rotarlo invalidaria las sesiones ya guardadas.
 */
object ManeCombLocationCredentials {
  data class Credentials(val token: String, val refreshToken: String)

  private const val TAG = "ManeCombLocationCreds"
  private const val KEY_ALIAS = "manecomb-location-credentials-v1"
  private const val KEY_TOKEN_ENCRYPTED = "tokenEncrypted"
  private const val KEY_REFRESH_TOKEN_ENCRYPTED = "refreshTokenEncrypted"

  fun write(prefs: SharedPreferences, token: String, refreshToken: String): Boolean {
    return try {
      val encryptedToken = ManeCombSecureStore.encrypt(KEY_ALIAS, token)
      val encryptedRefresh = ManeCombSecureStore.encrypt(KEY_ALIAS, refreshToken)
      prefs.edit()
        .putString(KEY_TOKEN_ENCRYPTED, encryptedToken)
        .putString(KEY_REFRESH_TOKEN_ENCRYPTED, encryptedRefresh)
        .remove(ManeCombLocationService.KEY_TOKEN)
        .remove(ManeCombLocationService.KEY_REFRESH_TOKEN)
        .apply()
      true
    } catch (error: Exception) {
      Log.e(TAG, "Could not encrypt background GPS credentials; restore will be disabled.", error)
      clear(prefs)
      false
    }
  }

  fun read(prefs: SharedPreferences): Credentials? {
    val encryptedToken = prefs.getString(KEY_TOKEN_ENCRYPTED, "").orEmpty()
    val encryptedRefresh = prefs.getString(KEY_REFRESH_TOKEN_ENCRYPTED, "").orEmpty()

    if (encryptedToken.isNotBlank()) {
      return try {
        Credentials(
          token = ManeCombSecureStore.decrypt(KEY_ALIAS, encryptedToken),
          refreshToken = if (encryptedRefresh.isBlank()) {
            ""
          } else {
            ManeCombSecureStore.decrypt(KEY_ALIAS, encryptedRefresh)
          }
        )
      } catch (error: Exception) {
        Log.e(TAG, "Could not decrypt background GPS credentials.", error)
        clear(prefs)
        null
      }
    }

    // One-time migration for installs that persisted credentials before M1.
    val legacyToken = prefs.getString(ManeCombLocationService.KEY_TOKEN, "").orEmpty()
    if (legacyToken.isBlank()) return null
    val legacyRefresh = prefs.getString(ManeCombLocationService.KEY_REFRESH_TOKEN, "").orEmpty()
    return if (write(prefs, legacyToken, legacyRefresh)) {
      Credentials(legacyToken, legacyRefresh)
    } else {
      null
    }
  }

  fun clear(prefs: SharedPreferences) {
    prefs.edit()
      .remove(KEY_TOKEN_ENCRYPTED)
      .remove(KEY_REFRESH_TOKEN_ENCRYPTED)
      .remove(ManeCombLocationService.KEY_TOKEN)
      .remove(ManeCombLocationService.KEY_REFRESH_TOKEN)
      .apply()
  }
}
