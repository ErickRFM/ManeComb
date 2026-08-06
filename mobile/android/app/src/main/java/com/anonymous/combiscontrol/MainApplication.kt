package com.anonymous.combiscontrol

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.anonymous.combiscontrol.audio.ManeCombAudioPackage
import com.anonymous.combiscontrol.calls.ManeCombCallPackage
import com.anonymous.combiscontrol.location.ManeCombLocationPackage
import com.anonymous.combiscontrol.notifications.ManeCombNotificationPackage
import com.anonymous.combiscontrol.documents.ManeCombDocumentFilePackage
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(ManeCombAudioPackage())
              add(ManeCombCallPackage())
              add(ManeCombLocationPackage())
              add(ManeCombNotificationPackage())
              add(ManeCombDocumentFilePackage())
            }

          override fun getJSMainModuleName(): String = "index"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    initializeFirebaseIfNeeded()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
  }

  private fun initializeFirebaseIfNeeded() {
    if (FirebaseApp.getApps(this).isNotEmpty()) return
    if (!BuildConfig.MANECOMB_FIREBASE_CONFIGURED) {
      Log.i(TAG, "FCM deshabilitado: falta google-services.json o MANECOMB_FIREBASE_*")
      return
    }

    try {
      val options = FirebaseOptions.Builder()
        .setProjectId(getString(R.string.manecomb_firebase_project_id))
        .setApplicationId(getString(R.string.manecomb_firebase_app_id))
        .setApiKey(getString(R.string.manecomb_firebase_api_key))
        .setGcmSenderId(getString(R.string.manecomb_firebase_sender_id))
        .build()
      FirebaseApp.initializeApp(this, options)
    } catch (error: Exception) {
      Log.e(TAG, "No fue posible inicializar Firebase", error)
    }
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
  }

  companion object {
    private const val TAG = "ManeCombApplication"
  }
}
