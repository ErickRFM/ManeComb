package com.anonymous.combiscontrol.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Cifrado de secretos de sesion respaldado por AndroidKeystore. Es la unica
 * implementacion de cripto para credenciales nativas de ManeComb: la usan tanto
 * el servicio de ubicacion como el de Radio.
 *
 * Cada consumidor aporta su propio alias de clave, de modo que borrar las
 * credenciales de un subsistema no invalida las del otro.
 */
object ManeCombSecureStore {
  private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private const val VERSION_PREFIX = "v1"

  fun encrypt(keyAlias: String, value: String): String {
    if (value.isBlank()) return ""
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(keyAlias))
    val iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP)
    val payload = Base64.encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    return "$VERSION_PREFIX:$iv:$payload"
  }

  fun decrypt(keyAlias: String, value: String): String {
    if (value.isBlank()) return ""
    val parts = value.split(':', limit = 3)
    require(parts.size == 3 && parts[0] == VERSION_PREFIX) { "Unsupported credential payload" }
    val iv = Base64.decode(parts[1], Base64.NO_WRAP)
    val payload = Base64.decode(parts[2], Base64.NO_WRAP)
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(keyAlias), GCMParameterSpec(128, iv))
    return cipher.doFinal(payload).toString(Charsets.UTF_8)
  }

  private fun getOrCreateKey(keyAlias: String): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }

    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    keyGenerator.init(
      KeyGenParameterSpec.Builder(
        keyAlias,
        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
      )
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setRandomizedEncryptionRequired(true)
        .build()
    )
    return keyGenerator.generateKey()
  }
}
