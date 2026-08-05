// RC-MOBILE-CALLS-PRODUCTION-01 Bloque B — Selectores del estado global de llamada.

import type { CallState } from './call-types';

// Solo conversaciones DIRECTAS pueden iniciar una llamada RTC (grupal -> Radio). El backend
// tambien lo rechaza (direct_call_required); esto es el gate de UI.
export const canConversationStartCall = (conversation?: { kind?: string } | null): boolean =>
  conversation?.kind === 'direct';

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
  busy: 'Ocupado',
  no_answer: 'Sin respuesta',
  cancelled: 'Llamada cancelada',
  ended: 'Llamada finalizada',
  failed: 'No se pudo conectar',
};

const PHASE_LABELS: Record<string, string> = {
  OUTGOING_RINGING: 'Llamando…',
  INCOMING_RINGING: 'Llamada entrante',
  CONNECTING: 'Conectando audio…',
  CONNECTED: 'En llamada',
};

// Etiqueta de estado para UI (no reemplaza el panel final del Bloque D).
export function selectStatusLabel(s: CallState): string {
  if ((s.phase === 'ENDING' || s.phase === 'FAILED') && s.endResult) {
    return RESULT_LABELS[s.endResult] || 'Llamada finalizada';
  }
  return PHASE_LABELS[s.phase] || '';
}
