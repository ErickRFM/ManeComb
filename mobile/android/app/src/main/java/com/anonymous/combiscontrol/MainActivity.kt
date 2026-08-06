package com.anonymous.combiscontrol

import android.content.Intent
import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    configureIncomingCallWindow(intent)
    super.onCreate(null)
  }

  override fun onNewIntent(intent: Intent) {
    configureIncomingCallWindow(intent)
    super.onNewIntent(intent)
    setIntent(intent)
  }

  /**
   * Solo una URL autoritativa /call puede aparecer sobre la pantalla bloqueada. Una apertura
   * normal restaura inmediatamente el comportamiento de privacidad habitual de la app.
   */
  private fun configureIncomingCallWindow(sourceIntent: Intent?) {
    val isCallIntent = sourceIntent?.data?.path?.trim()?.equals("/call", ignoreCase = true) == true
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(isCallIntent)
      setTurnScreenOn(isCallIntent)
    } else if (isCallIntent) {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    } else {
      @Suppress("DEPRECATION")
      window.clearFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
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
}
