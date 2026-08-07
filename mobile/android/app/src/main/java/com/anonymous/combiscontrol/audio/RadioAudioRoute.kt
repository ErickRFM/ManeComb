package com.anonymous.combiscontrol.audio

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.AudioTrack
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.Looper

/**
 * Autoridad unica de ruta de audio de Radio. No existe ningun otro punto que
 * decida por donde sale el audio: captura, PTT en vivo e historial preguntan
 * aqui. Se limita a expresar una preferencia sobre la salida (setPreferredDevice)
 * y nunca cambia el modo global de audio, para no pelear con Llamadas ni con la
 * politica del sistema.
 *
 * `auto` conserva la eleccion de Android con prioridad Bluetooth > cable >
 * altavoz, que es el comportamiento historico de ManeComb.
 */
class RadioAudioRoute(
  private val context: Context,
  private val onChange: (String) -> Unit
) {
  private val audioManager: AudioManager? = context.getSystemService(AudioManager::class.java)
  private val handler = Handler(Looper.getMainLooper())

  @Volatile private var requestedRoute: String = ROUTE_AUTO

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = notifyRoute()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = notifyRoute()
  }

  fun start() {
    audioManager?.registerAudioDeviceCallback(deviceCallback, handler)
  }

  fun stop() {
    audioManager?.unregisterAudioDeviceCallback(deviceCallback)
  }

  /** Rutas realmente presentes en el dispositivo, no una lista fija. */
  fun availableRoutes(): List<String> {
    val outputs = audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS).orEmpty()
    val routes = LinkedHashSet<String>()
    outputs.forEach { device -> routeOf(device)?.let(routes::add) }
    return routes.toList()
  }

  fun activeRoute(): String {
    val resolved = resolveDevice()
    return resolved?.let(::routeOf) ?: ROUTE_SPEAKER
  }

  fun requestedRoute(): String = requestedRoute

  /**
   * @return true si la ruta pedida existe. Una ruta ausente no se acepta en
   * silencio: la UI debe poder decir que no esta disponible.
   */
  fun select(route: String?): Boolean {
    val normalized = normalize(route)
    if (normalized != ROUTE_AUTO && !availableRoutes().contains(normalized)) return false
    requestedRoute = normalized
    notifyRoute()
    return true
  }

  fun applyTo(track: AudioTrack) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    runCatching { track.preferredDevice = resolveDevice() }
  }

  fun applyTo(player: MediaPlayer) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    runCatching { player.setPreferredDevice(resolveDevice()) }
  }

  private fun notifyRoute() {
    onChange(activeRoute())
  }

  private fun resolveDevice(): AudioDeviceInfo? {
    val outputs = audioManager?.getDevices(AudioManager.GET_DEVICES_OUTPUTS).orEmpty()
    if (outputs.isEmpty()) return null

    if (requestedRoute != ROUTE_AUTO) {
      outputs.firstOrNull { routeOf(it) == requestedRoute }?.let { return it }
    }

    return AUTO_PRIORITY.firstNotNullOfOrNull { route ->
      outputs.firstOrNull { routeOf(it) == route }
    }
  }

  private fun routeOf(device: AudioDeviceInfo): String? = when (device.type) {
    AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
    AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> ROUTE_BLUETOOTH
    AudioDeviceInfo.TYPE_WIRED_HEADSET,
    AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_USB_HEADSET -> ROUTE_WIRED
    AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> ROUTE_SPEAKER
    AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> ROUTE_EARPIECE
    else -> null
  }

  companion object {
    const val ROUTE_AUTO = "auto"
    const val ROUTE_BLUETOOTH = "bluetooth"
    const val ROUTE_WIRED = "wired"
    const val ROUTE_SPEAKER = "speaker"
    const val ROUTE_EARPIECE = "earpiece"

    // Un operador con manos libres espera que el audio vaya al accesorio.
    private val AUTO_PRIORITY = listOf(ROUTE_BLUETOOTH, ROUTE_WIRED, ROUTE_SPEAKER, ROUTE_EARPIECE)

    fun normalize(route: String?): String = when (route) {
      ROUTE_BLUETOOTH, ROUTE_WIRED, ROUTE_SPEAKER, ROUTE_EARPIECE -> route
      else -> ROUTE_AUTO
    }
  }
}
