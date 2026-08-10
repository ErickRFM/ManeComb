package com.anonymous.combiscontrol

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import java.util.UUID

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val clearIncomingCallWindow = Runnable {
    applyIncomingCallWindow(false)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    sanitizeCallIntent(intent)
    configureIncomingCallWindow(intent)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    sanitizeCallIntent(intent)
    configureIncomingCallWindow(intent)
    super.onNewIntent(intent)
    setIntent(intent)
  }

  /**
   * Solo una URL autoritativa /call puede aparecer sobre la pantalla bloqueada.
   * El lifecycle JS puede apagarla antes y este timeout nativo evita que una URL
   * invalida/vencida deje la Activity visible si React nunca llega a rehidratarla.
   */
  fun setIncomingCallWindowActive(active: Boolean) {
    mainHandler.removeCallbacks(clearIncomingCallWindow)
    applyIncomingCallWindow(active)
    if (active) {
      mainHandler.postDelayed(clearIncomingCallWindow, INCOMING_CALL_WINDOW_MAX_MS)
    }
  }

  /**
   * El scheme manecomb:// es publico por definicion de Android. Antes de que React/Linking
   * vea una URL /call exigimos un token aleatorio guardado en almacenamiento privado de la app.
   * Un extra booleano no basta porque otra app podria falsificarlo. Otros deep links publicos
   * (chat, rutas, etc.) conservan su comportamiento normal.
   */
  private fun sanitizeCallIntent(sourceIntent: Intent?) {
    val uri = sourceIntent?.data ?: return
    val isCallIntent = uri.path?.trim()?.equals("/call", ignoreCase = true) == true
    if (!isCallIntent) return

    val suppliedToken = sourceIntent.getStringExtra(EXTRA_INTERNAL_CALL_INTENT_TOKEN)
    val expectedToken = internalCallIntentToken(this)
    if (suppliedToken.isNullOrBlank() || suppliedToken != expectedToken) {
      sourceIntent.data = null
    }
  }

  private fun configureIncomingCallWindow(sourceIntent: Intent?) {
    val uri = sourceIntent?.data
    val isCallIntent = uri?.path?.trim()?.equals("/call", ignoreCase = true) == true
    val isTerminalIntent = uri?.getQueryParameter("action")?.equals("dismiss", ignoreCase = true) == true
    setIncomingCallWindowActive(isCallIntent && !isTerminalIntent)
  }

  private fun applyIncomingCallWindow(active: Boolean) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(active)
      setTurnScreenOn(active)
      return
    }

    @Suppress("DEPRECATION")
    if (active) {
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    } else {
      window.clearFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
  }

  override fun onDestroy() {
    mainHandler.removeCallbacks(clearIncomingCallWindow)
    super.onDestroy()
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return DefaultReactActivityDelegate(
      this,
      mainComponentName,
      fabricEnabled
    )
  }

  override fun invokeDefaultOnBackPressed() {
    if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
      if (!moveTaskToBack(false)) {
        super.invokeDefaultOnBackPressed()
      }
      return
    }

    super.invokeDefaultOnBackPressed()
  }

  companion object {
    const val EXTRA_INTERNAL_CALL_INTENT_TOKEN = "manecomb.internal.CALL_INTENT_TOKEN"
    private const val INTERNAL_CALL_PREFS = "manecomb_internal_call_intents"
    private const val INTERNAL_CALL_TOKEN_KEY = "token"
    private const val INCOMING_CALL_WINDOW_MAX_MS = 45_000L

    fun internalCallIntentToken(context: Context): String {
      val preferences = context.getSharedPreferences(INTERNAL_CALL_PREFS, Context.MODE_PRIVATE)
      val existing = preferences.getString(INTERNAL_CALL_TOKEN_KEY, null)
      if (!existing.isNullOrBlank()) return existing

      val created = UUID.randomUUID().toString()
      preferences.edit().putString(INTERNAL_CALL_TOKEN_KEY, created).apply()
      return created
    }
  }
}
