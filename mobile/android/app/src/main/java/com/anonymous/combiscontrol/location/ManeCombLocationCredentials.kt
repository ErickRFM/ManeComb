package com.anonymous.combiscontrol.location

import android.content.SharedPreferences
import android.util.Log
import com.anonymous.combiscontrol.security.ManeCombSecureStore
import java.util.UUID

object ManeCombLocationCredentials {
  data class Credentials(
    val token: String,
    val refreshToken: String,
    val refreshRequestId: String?
  )

  private const val TAG = "ManeCombLocationCreds"
  private const val KEY_ALIAS = "manecomb-location-credentials-v1"
  private const val KEY_TOKEN_ENCRYPTED = "tokenEncrypted"
  private const val KEY_REFRESH_TOKEN_ENCRYPTED = "refreshTokenEncrypted"
  private const val KEY_REFRESH_REQUEST_ID = "refreshRequestId"

  fun write(prefs: SharedPreferences, token: String, refreshToken: String): Boolean {
    return try {
      val encryptedToken = ManeCombSecureStore.encrypt(KEY_ALIAS, token)
      val encryptedRefresh = ManeCombSecureStore.encrypt(KEY_ALIAS, refreshToken)
      prefs.edit()
        .putString(KEY_TOKEN_ENCRYPTED, encryptedToken)
        .putString(KEY_REFRESH_TOKEN_ENCRYPTED, encryptedRefresh)
        .remove(KEY_REFRESH_REQUEST_ID)
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
    val refreshRequestId = prefs.getString(KEY_REFRESH_REQUEST_ID, "")
      ?.trim()
      ?.takeIf { it.isNotBlank() }

    if (encryptedToken.isNotBlank()) {
      return try {
        Credentials(
          token = ManeCombSecureStore.decrypt(KEY_ALIAS, encryptedToken),
          refreshToken = if (encryptedRefresh.isBlank()) "" else ManeCombSecureStore.decrypt(KEY_ALIAS, encryptedRefresh),
          refreshRequestId = refreshRequestId
        )
      } catch (error: Exception) {
        Log.e(TAG, "Could not decrypt background GPS credentials.", error)
        clear(prefs)
        null
      }
    }

    val legacyToken = prefs.getString(ManeCombLocationService.KEY_TOKEN, "").orEmpty()
    if (legacyToken.isBlank()) return null
    val legacyRefresh = prefs.getString(ManeCombLocationService.KEY_REFRESH_TOKEN, "").orEmpty()
    return if (write(prefs, legacyToken, legacyRefresh)) {
      Credentials(legacyToken, legacyRefresh, null)
    } else null
  }

  fun getOrCreateRefreshRequestId(prefs: SharedPreferences): String {
    val existing = prefs.getString(KEY_REFRESH_REQUEST_ID, "")
      ?.trim()
      ?.takeIf { it.isNotBlank() }
    if (existing != null) return existing

    val requestId = UUID.randomUUID().toString()
    prefs.edit().putString(KEY_REFRESH_REQUEST_ID, requestId).commit()
    return requestId
  }

  fun setRefreshRequestId(prefs: SharedPreferences, refreshRequestId: String?) {
    val editor = prefs.edit()
    val normalized = refreshRequestId?.trim().orEmpty()
    if (normalized.isBlank()) {
      editor.remove(KEY_REFRESH_REQUEST_ID)
    } else {
      editor.putString(KEY_REFRESH_REQUEST_ID, normalized)
    }
    editor.commit()
  }

  fun clear(prefs: SharedPreferences) {
    prefs.edit()
      .remove(KEY_TOKEN_ENCRYPTED)
      .remove(KEY_REFRESH_TOKEN_ENCRYPTED)
      .remove(KEY_REFRESH_REQUEST_ID)
      .remove(ManeCombLocationService.KEY_TOKEN)
      .remove(ManeCombLocationService.KEY_REFRESH_TOKEN)
      .apply()
  }
}
