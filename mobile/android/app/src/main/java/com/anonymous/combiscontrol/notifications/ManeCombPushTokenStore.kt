package com.anonymous.combiscontrol.notifications

import android.content.Context

object ManeCombPushTokenStore {
  private const val PREFERENCES = "manecomb-push"
  private const val KEY_FCM_TOKEN = "fcm-token"

  fun save(context: Context, token: String) {
    val safeToken = token.trim()
    if (safeToken.isEmpty()) return
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_FCM_TOKEN, safeToken)
      .apply()
  }

  fun read(context: Context): String? =
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .getString(KEY_FCM_TOKEN, null)
      ?.trim()
      ?.takeIf { it.isNotEmpty() }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_FCM_TOKEN)
      .apply()
  }
}
