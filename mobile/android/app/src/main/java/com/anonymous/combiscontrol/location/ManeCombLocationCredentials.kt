package com.anonymous.combiscontrol.location

import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object ManeCombLocationCredentials {
  data class Credentials(val token: String, val refreshToken: String)

  private const val TAG = "ManeCombLocationCreds"
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val KEY_ALIAS = "manecomb-location-credentials-v1"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val KEY_TOKEN_ENCRYPTED = "tokenEncrypted"
  private const val KEY_REFRESH_TOKEN_ENCRYPTED = "refreshTokenEncrypted"
  private const val VERSION_PREFIX = "v1"

  fun write(prefs: SharedPreferences, token: String, refreshToken: String): Boolean {
    return try {
      val encryptedToken = encrypt(token)
      val encryptedRefresh = encrypt(refreshToken)
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
          token = decrypt(encryptedToken),
          refreshToken = if (encryptedRefresh.isBlank()) "" else decrypt(encryptedRefresh)
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

  private fun encrypt(value: String): String {
    if (value.isBlank()) return ""
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
    val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val payload = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    return "$VERSION_PREFIX:$iv:$payload"
  }

  private fun decrypt(value: String): String {
    if (value.isBlank()) return ""
    val parts = value.split(':', limit = 3)
    require(parts.size == 3 && parts[0] == VERSION_PREFIX) { "Unsupported credential payload" }
    val iv = Base64.decode(parts[1], Base64.NO_WRAP)
    val payload = Base64.decode(parts[2], Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
    return cipher.doFinal(payload).toString(Charsets.UTF_8)
  }

  private fun getOrCreateKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
      .build()
    keyGenerator.init(spec)
    return keyGenerator.generateKey()
  }
}
