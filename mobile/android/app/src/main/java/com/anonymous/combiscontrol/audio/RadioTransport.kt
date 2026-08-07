package com.anonymous.combiscontrol.audio

/**
 * Frontera del transporte de Radio. El controlador de sesion depende de esta
 * interfaz y no de Socket.IO, de modo que su logica se certifica en JVM con un
 * transporte falso.
 */
interface RadioTransport {
  fun connect(credentials: RadioSessionCredentials)
  fun disconnect()
  fun join(channelId: String, ack: (RadioAck) -> Unit)
  fun leave(channelId: String)
  fun requestFloor(channelId: String, ack: (RadioAck) -> Unit)
  /** @return false si el frame no pudo entregarse al socket. */
  fun sendFrame(frame: RadioOutboundFrame): Boolean
  fun endFloor(channelId: String, transmissionId: String, ack: (RadioAck) -> Unit)
  fun setListener(listener: RadioTransportListener?)
}

data class RadioAck(
  val ok: Boolean,
  val error: String? = null,
  val transmissionId: String? = null,
  val transmitter: RadioOperator? = null
) {
  companion object {
    const val ERROR_TIMEOUT = "radio_ack_timeout"
    const val ERROR_DISCONNECTED = "radio_disconnected"
  }
}

data class RadioOutboundFrame(
  val channelId: String,
  val transmissionId: String,
  val sequence: Int,
  val sentAt: Long,
  val data: String
)

interface RadioTransportListener {
  fun onConnected()
  fun onDisconnected(reason: RadioDisconnectReason)
  fun onRemoteTransmissionStarted(transmissionId: String, operator: RadioOperator)
  fun onRemoteFrame(transmissionId: String, sequence: Int, data: String)
  fun onRemoteTransmissionEnded(transmissionId: String, reason: String?)
  fun onServerError(message: String)
}
