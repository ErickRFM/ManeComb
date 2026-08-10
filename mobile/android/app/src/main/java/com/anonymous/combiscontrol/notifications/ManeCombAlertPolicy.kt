package com.anonymous.combiscontrol.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import com.anonymous.combiscontrol.R
import kotlin.math.abs

/**
 * Politica UNICA de feedback operacional.
 *
 * (category, level) -> canal, sonido, vibracion, prioridad y visibilidad.
 *
 * La consumen las dos rutas nativas que existen —el renderer de FCM y el modulo
 * expuesto a JS— para que no haya dos switches que puedan divergir. La gravedad
 * la resuelve backend y viaja como `level`; aqui se consume, no se recalcula.
 * `severity` solo se mira cuando el payload es legado y no trae `level`, y nunca
 * se deduce nada del texto del titulo.
 *
 * RTC queda fuera a proposito: las llamadas conservan su canal, su ringtone y su
 * patron, y nada de aqui los toca.
 */
object ManeCombAlertPolicy {

  // Canales versionados: los ajustes de un NotificationChannel son inmutables
  // una vez creado, asi que en un telefono que ya instalo ManeComb reutilizar
  // `operacion-sos` dejaria el sonido viejo para siempre. Se conserva el
  // vocabulario `operacion-*` y se versiona el id.
  const val CHANNEL_SOS = "operacion-sos-v2"
  const val CHANNEL_HIGH = "operacion-incidentes-alta-v2"
  const val CHANNEL_STANDARD = "operacion-incidentes-v2"

  private const val LEVEL_CRITICAL = "critical"
  private const val LEVEL_WARNING = "warning"

  data class AlertFeedback(
    val channelId: String,
    val channelName: String,
    val channelDescription: String,
    val soundResource: Int,
    val vibrationPattern: LongArray,
    val importance: Int,
    val priority: Int
  )

  private val sos = AlertFeedback(
    channelId = CHANNEL_SOS,
    channelName = "Alertas SOS",
    channelDescription = "Alertas criticas de seguridad reportadas por conductores",
    soundResource = R.raw.alert_sos,
    vibrationPattern = longArrayOf(0, 500, 180, 500, 180, 500, 180, 700),
    importance = NotificationManager.IMPORTANCE_HIGH,
    priority = NotificationCompat.PRIORITY_MAX
  )

  private val high = AlertFeedback(
    channelId = CHANNEL_HIGH,
    channelName = "Incidencias de alta prioridad",
    channelDescription = "Incidencias operativas que requieren atencion inmediata",
    soundResource = R.raw.alert_high,
    vibrationPattern = longArrayOf(0, 320, 140, 320),
    importance = NotificationManager.IMPORTANCE_HIGH,
    priority = NotificationCompat.PRIORITY_HIGH
  )

  private val standard = AlertFeedback(
    channelId = CHANNEL_STANDARD,
    channelName = "Incidencias",
    channelDescription = "Incidencias operativas informativas",
    soundResource = R.raw.alert_standard,
    vibrationPattern = longArrayOf(0, 180),
    importance = NotificationManager.IMPORTANCE_DEFAULT,
    priority = NotificationCompat.PRIORITY_DEFAULT
  )

  private val all = listOf(sos, high, standard)

  /** Categorias que produce `deliverOperationalNotification` para incidencias. */
  fun isOperationalAlert(category: String?): Boolean {
    return when (category?.trim()?.lowercase()) {
      "sos", "emergency", "emergencies", "emergencia", "emergencias",
      "incident", "incidents", "incidente", "incidencias" -> true
      else -> false
    }
  }

  /**
   * Resuelve el feedback. Devuelve null si el payload no es una alerta
   * operativa, para que el llamador conserve su comportamiento actual (chat,
   * llamadas) sin que esta politica decida por el.
   */
  fun resolve(category: String?, level: String?, severity: String? = null): AlertFeedback? {
    if (!isOperationalAlert(category)) return null

    val normalizedCategory = category?.trim()?.lowercase().orEmpty()
    val normalizedLevel = level?.trim()?.lowercase().orEmpty()

    if (normalizedCategory == "sos" ||
      normalizedCategory.startsWith("emergenc") ||
      normalizedLevel == LEVEL_CRITICAL
    ) {
      return sos
    }

    if (normalizedLevel == LEVEL_WARNING) return high
    if (normalizedLevel.isNotEmpty()) return standard

    // Payload legado sin `level`: backend antiguo. Se usa `severity`, que es un
    // campo estructurado, nunca el texto visible.
    return when (severity?.trim()?.lowercase()) {
      "critical" -> sos
      "high" -> high
      else -> standard
    }
  }

  fun soundUri(context: Context, feedback: AlertFeedback): Uri =
    Uri.parse("android.resource://${context.packageName}/${feedback.soundResource}")

  /**
   * Crea los canales v2. No borra los antiguos: una instalacion previa conserva
   * `operacion-sos`, `operacion-incidentes` y `operacion-emergencias` con los
   * ajustes que el usuario pudiera haberles puesto.
   */
  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return

    // USAGE_NOTIFICATION_EVENT, no USAGE_NOTIFICATION_RINGTONE: el uso de
    // ringtone pertenece a las llamadas y no debe compartirse con incidencias.
    val attributes = AudioAttributes.Builder()
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
      .build()

    all.forEach { feedback ->
      val channel = NotificationChannel(
        feedback.channelId,
        feedback.channelName,
        feedback.importance
      ).apply {
        description = feedback.channelDescription
        enableVibration(true)
        vibrationPattern = feedback.vibrationPattern
        setSound(soundUri(context, feedback), attributes)
        // El detalle de la incidencia no se expone en pantalla bloqueada.
        lockscreenVisibility = NotificationCompat.VISIBILITY_PRIVATE
        // Nada de setBypassDnd: se respeta No molestar y el volumen del usuario.
      }
      manager.createNotificationChannel(channel)
    }
  }

  /**
   * Identidad estable de la notificacion. Se deriva del incidentId y nunca del
   * titulo: dos incidencias distintas con el mismo titulo deben coexistir.
   */
  fun notificationIdFor(incidentId: String, fallbackKey: String): Int {
    val key = incidentId.trim().ifEmpty { fallbackKey.trim() }
    return abs("incident:$key".hashCode())
  }

  // --- Dedup compartido -----------------------------------------------------
  //
  // Socket y FCM pueden entregar el MISMO incidente casi a la vez durante una
  // transicion foreground/background: asumir que "FCM es background y socket es
  // foreground" no elimina la carrera. Ambas rutas consultan esta unica memoria
  // antes de emitir sonido o vibracion, para que exista una sola reaccion.
  //
  // La clave es el incidentId, asi que dos incidencias distintas —aunque
  // compartan titulo, unidad o tipo— no se deduplican nunca.

  const val DEDUP_WINDOW_MS = 8_000L
  private const val DEDUP_MAX_ENTRIES = 64

  private val recentAlerts = LinkedHashMap<String, Long>()

  @Synchronized
  fun shouldEmitAlert(alertKey: String, nowMs: Long): Boolean {
    val key = alertKey.trim()
    if (key.isEmpty()) return true

    val iterator = recentAlerts.entries.iterator()
    while (iterator.hasNext()) {
      if (nowMs - iterator.next().value >= DEDUP_WINDOW_MS) iterator.remove()
    }

    val seenAt = recentAlerts[key]
    if (seenAt != null && nowMs - seenAt < DEDUP_WINDOW_MS) return false

    recentAlerts[key] = nowMs
    while (recentAlerts.size > DEDUP_MAX_ENTRIES) {
      val oldest = recentAlerts.keys.firstOrNull() ?: break
      recentAlerts.remove(oldest)
    }
    return true
  }

  @Synchronized
  fun resetDedupForTests() {
    recentAlerts.clear()
  }
}
