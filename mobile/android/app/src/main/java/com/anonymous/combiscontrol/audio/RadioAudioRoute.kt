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
import java.lang.ref.WeakReference
import java.util.concurrent.CopyOnWriteArraySet

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
class RadioAudioRoute private constructor(private val context: Context) {
  private val audioManager: AudioManager? = context.getSystemService(AudioManager::class.java)
  private val handler = Handler(Looper.getMainLooper())
  private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

  @Volatile private var requestedRoute: String = ROUTE_AUTO
  @Volatile private var watching = false
  @Volatile private var liveTrackRef: WeakReference<AudioTrack>? = null
  @Volatile private var historyPlayerRef: WeakReference<MediaPlayer>? = null

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) = notifyRoute()
    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) = notifyRoute()
  }

  @Synchronized
  fun addListener(listener: (String) -> Unit) {
    listeners.add(listener)
    if (!watching) {
      watching = true
      audioManager?.registerAudioDeviceCallback(deviceCallback, handler)
    }
  }

  @Synchronized
  fun removeListener(listener: (String) -> Unit) {
    listeners.remove(listener)
    if (listeners.isEmpty() && watching) {
      watching = false
      audioManager?.unregisterAudioDeviceCallback(deviceCallback)
    }
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
    liveTrackRef = WeakReference(track)
    runCatching { track.preferredDevice = resolveDevice() }
  }

  fun applyTo(player: MediaPlayer) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    historyPlayerRef = WeakReference(player)
    runCatching { player.setPreferredDevice(resolveDevice()) }
  }

  private fun reconcileRequestedRoute() {
    val current = requestedRoute
    if (current != ROUTE_AUTO && !availableRoutes().contains(current)) {
      requestedRoute = ROUTE_AUTO
    }
  }

  private fun reapplyBoundOutputs() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val device = resolveDevice()
    liveTrackRef?.get()?.let { track -> runCatching { track.preferredDevice = device } }
    historyPlayerRef?.get()?.let { player -> runCatching { player.setPreferredDevice(device) } }
  }

  private fun notifyRoute() {
    // Una conexion/desconexion debe afectar tambien al audio que ya esta sonando,
    // no solo al siguiente AudioTrack/MediaPlayer que se cree.
    reconcileRequestedRoute()
    reapplyBoundOutputs()
    val route = activeRoute()
    listeners.forEach { listener -> listener(route) }
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

    @Volatile private var instance: RadioAudioRoute? = null

    /** Una sola autoridad de ruta por proceso: la comparten Radio en vivo e historial. */
    fun shared(context: Context): RadioAudioRoute =
      instance ?: synchronized(this) {
        instance ?: RadioAudioRoute(context.applicationContext).also { instance = it }
      }
  }
}
