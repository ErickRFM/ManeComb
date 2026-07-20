export type RtcJoinAck = {
  ok?: boolean;
  reason?: string;
};

/**
 * El backend responde `rtc:join` por acknowledgement, no por evento
 * (backend/src/sockets/index.js:1119,1139,1153). Sin consumir el ack, un
 * rechazo como `busy` se pierde en silencio y la llamada queda colgada en
 * "llamando".
 *
 * Devuelve null cuando el join fue aceptado, o el aviso a mostrar en
 * `callNotice` cuando hay que abortar la llamada.
 */
export function resolveRtcJoinFailureNotice(
  ack: RtcJoinAck | null | undefined,
  ackError?: Error | null
): string | null {
  if (ackError) {
    return 'El servidor de llamadas no respondio. Revisa tu conexion.';
  }

  if (!ack) {
    return 'No fue posible iniciar la llamada.';
  }

  if (ack.ok) {
    return null;
  }

  switch (ack.reason) {
    case 'busy':
      return 'La persona esta en otra llamada.';
    case 'forbidden':
      return 'No tienes permiso para llamar en esta conversacion.';
    default:
      return 'No fue posible iniciar la llamada.';
  }
}
