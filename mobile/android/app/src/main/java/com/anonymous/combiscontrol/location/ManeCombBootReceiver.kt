package com.anonymous.combiscontrol.location

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class ManeCombBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action
    if (
      action != Intent.ACTION_BOOT_COMPLETED &&
      action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) {
      return
    }

    val restored = ManeCombLocationService.startFromPersistedConfig(context)
    Log.i(TAG, "Background GPS restore action=$action restored=$restored")
  }

  companion object {
    private const val TAG = "ManeCombBootReceiver"
  }
}
