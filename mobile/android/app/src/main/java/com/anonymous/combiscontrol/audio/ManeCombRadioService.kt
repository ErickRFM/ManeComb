package com.anonymous.combiscontrol.audio

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.anonymous.combiscontrol.MainActivity
import com.anonymous.combiscontrol.R

/**
 * Duenio del subsistema Radio en Android. Posee el transporte Socket.IO, el
 * pipeline de audio PTT, la maquina de estados y la reconexion. React Native le
 * envia comandos y observa instantaneas: no participa del camino critico del
 * audio ni de la sesion.
 *
 * Por eso el servicio sobrevive a que la pantalla de Radio se desmonte, a que la
 * app pase a segundo plano y a que el runtime JS quede suspendido.
 *
 * Toda la sesion se ejecuta en un hilo propio (`ManeCombRadioSession`): los
 * comandos llegan del hilo de modulos de React, los eventos de red del hilo de
 * Socket.IO y los frames del hilo de captura, y ninguno puede tocar el estado
 * directamente.
 */
class ManeCombRadioService : Service() {

  private val mainHandler = Handler(Looper.getMainLooper())
  private lateinit var sessionThread: HandlerThread
  private lateinit var sessionHandler: Handler
  private lateinit var audioSession: RadioAudioSession
  private lateinit var controller: RadioSessionController
  private var currentState = RadioSessionState()

  private val scheduler = object : RadioScheduler {
    override fun postDelayed(delayMs: Long, action: () -> Unit): RadioCancellable {
      val runnable = Runnable { action() }
      sessionHandler.postDelayed(runnable, delayMs)
      return object : RadioCancellable {
        override fun cancel() = sessionHandler.removeCallbacks(runnable)
      }
    }
  }

  private val audioListener = object : RadioAudioSession.Listener {
    override fun onFrameCaptured(base64Data: String, sequence: Int, capturedAt: Long) {
      // El controlador confina por si mismo: el hilo de captura no se bloquea.
      controller.onFrameCaptured(base64Data, sequence, capturedAt)
    }

    override fun onAudioLevel(level: Double) {
      audioLevelListener?.invoke(level)
    }

    override fun onAudioFailure(code: String) {
      controller.onAudioFailure(code)
    }
  }

  override fun onCreate() {
    super.onCreate()
    RadioLog.event("service_created")
    createNotificationChannel()
    promoteToForeground(transmitting = false)

    sessionThread = HandlerThread("ManeCombRadioSession").apply { start() }
    sessionHandler = Handler(sessionThread.looper)

    audioSession = RadioAudioSession.shared(this)
    audioSession.setListener(audioListener)
    controller = RadioSessionController(
      transport = SocketIoRadioTransport(),
      audio = audioSession,
      scheduler = scheduler,
      confine = { action -> sessionHandler.post(action) },
      onStateChanged = { state -> mainHandler.post { publishState(state) } }
    )
    activeService = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_ACTIVATE -> handleActivate(intent)
      ACTION_DEACTIVATE -> handleDeactivate()
    }
    // El servicio no puede reconstruir la sesion por si mismo si el proceso muere:
    // seria una notificacion sin canal detras. La app lo reactiva al volver.
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    RadioLog.event("service_destroyed")
    if (activeService === this) activeService = null
    controller.deactivate()
    audioSession.setListener(null)
    mainHandler.removeCallbacksAndMessages(null)
    // quitSafely drena la desactivacion ya encolada antes de cerrar el hilo.
    sessionThread.quitSafely()
    super.onDestroy()
  }

  // ---------------- Comandos ----------------

  private fun handleActivate(intent: Intent) {
    val credentials = RadioSessionCredentials(
      token = intent.getStringExtra(EXTRA_TOKEN).orEmpty(),
      userId = intent.getStringExtra(EXTRA_USER_ID).orEmpty(),
      userName = intent.getStringExtra(EXTRA_USER_NAME).orEmpty(),
      socketUrl = intent.getStringExtra(EXTRA_SOCKET_URL).orEmpty(),
      authRevision = intent.getLongExtra("authRevision", 0)
    )
    val channelId = intent.getStringExtra(EXTRA_CHANNEL_ID).orEmpty()
    if (!credentials.isUsable || channelId.isBlank()) {
      RadioLog.warn("credentials_unavailable")
      handleDeactivate()
      return
    }

    RadioLog.event("credentials_available", "userId" to credentials.userId)
    controller.activate(credentials, channelId)
  }

  private fun handleDeactivate() {
    // Logout: no puede quedar socket, canal, captura, identidad ni notificacion.
    controller.deactivate()
    // stopSelf va detras de la desactivacion en la misma cola de sesion, para
    // que el socket y el audio se cierren antes de destruir el servicio.
    sessionHandler.post { mainHandler.post { stopSelf() } }
  }

  /** Activacion directa cuando el servicio ya esta vivo: evita reiniciar el foreground. */
  fun startCommandFromModule(credentials: RadioSessionCredentials, channelId: String) {
    RadioLog.event("credentials_available", "userId" to credentials.userId)
    controller.activate(credentials, channelId)
  }

  fun selectChannel(channelId: String) = controller.selectChannel(channelId)

  fun requestTransmission() = controller.requestTransmission()

  fun endTransmission() = controller.endTransmission()

  fun notifyCallStarted() = controller.onCallStarted()

  fun notifyCallEnded() = controller.onCallEnded()

  fun setSessionAuthState(unauthorized: Boolean) = controller.setSessionAuthState(unauthorized)

  fun deactivate() = handleDeactivate()

  fun currentSnapshot(): RadioSessionState = controller.snapshot()

  // ---------------- Estado y notificacion ----------------

  private fun publishState(state: RadioSessionState) {
    val previous = currentState
    currentState = state
    lastSnapshot = state
    if (previous.phase != state.phase) {
      RadioLog.event(
        "phase",
        "from" to previous.phase,
        "to" to state.phase,
        "channelId" to state.channelId,
        "connected" to state.connected,
        "errorCode" to state.errorCode
      )
    }
    // El tipo de foreground service refleja el estado real: microphone solo
    // mientras se transmite, que es lo unico que Android 14+ acepta.
    val promoted = promoteToForeground(transmitting = state.capturing)
    if (state.capturing && !promoted) {
      // Android nego el tipo microphone (restricciones de inicio en segundo
      // plano). Capturar de todos modos produciria silencio: se corta la
      // transmision en lugar de emitir audio vacio al canal.
      RadioLog.warn("foreground_microphone_denied")
      controller.onAudioFailure("radio_foreground_microphone_denied")
    }
    snapshotListener?.invoke(state)
  }

  /** @return false si Android rechazo el tipo de servicio solicitado. */
  private fun promoteToForeground(transmitting: Boolean): Boolean {
    val withMicrophone = transmitting && hasMicrophonePermission()
    val notification = buildNotification()

    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val serviceType = if (withMicrophone) {
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or
            ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
          ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
        }
        startForeground(NOTIFICATION_ID, notification, serviceType)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      withMicrophone == transmitting
    } catch (error: Exception) {
      // ForegroundServiceStartNotAllowedException y SecurityException no pueden
      // derribar el servicio: Radio debe seguir escuchando aunque no pueda
      // transmitir en este momento.
      RadioLog.error("foreground_promotion_failed", error, "transmitting" to transmitting)
      false
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL_ID, "Radio en vivo", NotificationManager.IMPORTANCE_LOW)
    )
  }

  private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
    .setSmallIcon(R.drawable.notification_icon)
    .setContentTitle("ManeComb Radio")
    .setContentText(notificationTextFor(currentState))
    .setContentIntent(
      PendingIntent.getActivity(
        this,
        0,
        Intent(this, MainActivity::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    )
    .setOngoing(true)
    .setOnlyAlertOnce(true)
    .build()

  private fun hasMicrophonePermission(): Boolean =
    ContextCompat.checkSelfPermission(this, android.Manifest.permission.RECORD_AUDIO) ==
      PackageManager.PERMISSION_GRANTED

  companion object {
    private const val CHANNEL_ID = "manecomb-radio-live"
    private const val NOTIFICATION_ID = 2402

    const val ACTION_ACTIVATE = "com.anonymous.combiscontrol.audio.RADIO_ACTIVATE"
    const val ACTION_DEACTIVATE = "com.anonymous.combiscontrol.audio.RADIO_DEACTIVATE"
    const val EXTRA_TOKEN = "token"
    const val EXTRA_USER_ID = "userId"
    const val EXTRA_USER_NAME = "userName"
    const val EXTRA_SOCKET_URL = "socketUrl"
    const val EXTRA_CHANNEL_ID = "channelId"

    @Volatile var activeService: ManeCombRadioService? = null
      private set

    @Volatile var lastSnapshot: RadioSessionState = RadioSessionState()
      private set

    /** Puente hacia React Native. Solo transporta instantaneas, nunca frames. */
    @Volatile var snapshotListener: ((RadioSessionState) -> Unit)? = null

    @Volatile var audioLevelListener: ((Double) -> Unit)? = null

    /**
     * La notificacion dice lo que Radio hace de verdad. Nunca afirma que el canal
     * esta preparado cuando el transporte esta caido.
     */
    fun notificationTextFor(state: RadioSessionState): String = when (state.phase) {
      RadioPhase.TRANSMITTING -> "Transmitiendo en el canal"
      RadioPhase.RECEIVING -> "Recibiendo de ${state.operator?.name ?: "un operador"}"
      RadioPhase.REQUESTING -> "Solicitando el canal"
      RadioPhase.CHANNEL_BUSY -> "Canal ocupado"
      RadioPhase.LISTENING -> "Escuchando el canal"
      RadioPhase.JOINING -> "Conectando al canal"
      RadioPhase.RECONNECTING -> "Reconectando"
      RadioPhase.PAUSED_BY_CALL -> "En pausa durante la llamada"
      RadioPhase.UNAUTHORIZED -> "Sesion expirada"
      RadioPhase.ERROR -> "Radio no disponible"
      RadioPhase.IDLE -> "Radio inactiva"
    }

    fun activationIntent(
      context: Context,
      credentials: RadioSessionCredentials,
      channelId: String
    ): Intent = Intent(context, ManeCombRadioService::class.java).apply {
      action = ACTION_ACTIVATE
      putExtra(EXTRA_TOKEN, credentials.token)
      putExtra(EXTRA_USER_ID, credentials.userId)
      putExtra(EXTRA_USER_NAME, credentials.userName)
      putExtra(EXTRA_SOCKET_URL, credentials.socketUrl)
      putExtra("authRevision", credentials.authRevision)
      putExtra(EXTRA_CHANNEL_ID, channelId)
    }

    fun deactivationIntent(context: Context): Intent =
      Intent(context, ManeCombRadioService::class.java).apply { action = ACTION_DEACTIVATE }
  }
}
