// Traduccion unica de fallos de Radio a texto de operador. La consumen el
// transporte (errores de socket) y la pantalla (codigos del runtime).
const OPERATOR_MESSAGES: Record<string, string> = {
  channel_busy: 'Canal ocupado',
  radio_ack_timeout: 'Servidor no disponible',
  radio_capture_failed: 'Error de audio PTT',
  radio_capture_start_failed: 'Microfono no disponible',
  radio_disconnected: 'Radio desconectado',
  radio_foreground_service_start_failed: 'Android bloqueo el servicio de Radio',
  radio_frame_playback_failed: 'Audio recibido no disponible',
  radio_frame_transport_lost: 'Conexion PTT interrumpida',
  radio_not_joined: 'Canal no disponible',
  radio_not_ready: 'Radio no esta lista',
  radio_playback_start_failed: 'Audio no disponible',
  radio_realtime_error: 'Error de Radio',
  radio_runtime_unavailable: 'Radio no disponible',
  radio_unauthorized: 'Sesion expirada',
  radio_unavailable: 'Radio no disponible',
  rate_exceeded: 'Transmision cortada por cadencia',
  max_duration: 'Se alcanzo la duracion maxima',
  authority_lost: 'Se perdio el canal',
  timeout: 'La transmision expiro',
};

export function getRadioRealtimeErrorMessage(error?: string) {
  const value = String(error || '').toLowerCase();
  if (value.includes('unauthorized') || value.includes('invalid token') || value.includes('jwt')) {
    return 'Sesion expirada';
  }
  if (value.includes('forbidden')) return 'Sin permisos para transmitir';
  if (value.includes('timeout')) return 'Servidor no disponible';
  return 'Error de conexion';
}

export function getRadioLiveErrorMessage(code?: string | null) {
  const value = String(code || '').trim();
  if (!value) return null;
  return OPERATOR_MESSAGES[value] || getRadioRealtimeErrorMessage(value);
}
