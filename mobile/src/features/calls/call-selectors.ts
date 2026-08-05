import type { CallState } from './call-types';

export const canConversationStartCall = (conversation?: { kind?: string } | null): boolean =>
  conversation?.kind === 'direct';

export const computeElapsedSeconds = (connectedAt: number | null, nowMs: number): number =>
  connectedAt ? Math.max(0, Math.floor((nowMs - connectedAt) / 1000)) : 0;

export const selectPhase = (s: CallState) => s.phase;
export const selectIsIncoming = (s: CallState) => s.phase === 'INCOMING_RINGING';
export const selectIsOutgoing = (s: CallState) => s.phase === 'OUTGOING_RINGING';
export const selectIsActiveCall = (s: CallState) =>
  s.phase !== 'IDLE' && s.phase !== 'ENDING' && s.phase !== 'FAILED';
export const selectCallerName = (s: CallState) => s.callerName;
export const selectMode = (s: CallState) => s.mode;
export const selectCallId = (s: CallState) => s.callId;
export const selectEndResult = (s: CallState) => s.endResult;

const RESULT_LABELS: Record<string, string> = {
  rejected: 'Llamada rechazada',
  busy: 'La persona esta ocupada',
  no_answer: 'Sin respuesta',
  cancelled: 'Llamada cancelada',
  ended: 'Llamada finalizada',
  failed: 'No se pudo conectar',
};

const PHASE_LABELS: Record<string, string> = {
  OUTGOING_RINGING: 'Llamando…',
  INCOMING_RINGING: 'Llamada entrante',
  CONNECTING: 'Conectando…',
  CONNECTED: 'En llamada',
  RECONNECTING: 'Reconectando…',
};

export function selectStatusLabel(s: CallState): string {
  if ((s.phase === 'ENDING' || s.phase === 'FAILED') && s.endResult) {
    return RESULT_LABELS[s.endResult] || 'Llamada finalizada';
  }
  return PHASE_LABELS[s.phase] || '';
}

export function selectFailureMessage(s: CallState): string | null {
  if (s.phase !== 'FAILED') return null;
  const messages: Record<string, string> = {
    rtc_config_unavailable: 'No fue posible obtener la configuracion segura de llamada.',
    media_capture_failed: 'No fue posible abrir el microfono o la camara.',
    microphone_unavailable: 'No se encontro un microfono disponible.',
    camera_unavailable: 'No se encontro una camara disponible.',
    webrtc_unavailable: 'Este dispositivo no dispone del motor de llamadas.',
    join_ack_timeout: 'El servidor no confirmo la entrada a la llamada.',
    unknown_call: 'La llamada ya no esta disponible.',
    call_ended: 'La llamada ya finalizo.',
    forbidden: 'Tu sesion no tiene acceso a esta llamada.',
    busy: 'La sala de llamada ya esta ocupada.',
    ice_timeout: 'No fue posible establecer el audio a tiempo.',
    ice_disconnected: 'La conexion de la llamada se perdio.',
    ice_failed: 'La red no pudo establecer la llamada.',
    negotiation_failed: 'No fue posible negociar el audio o video.',
  };
  return messages[s.failureCode || ''] || 'La llamada no pudo completarse.';
}
