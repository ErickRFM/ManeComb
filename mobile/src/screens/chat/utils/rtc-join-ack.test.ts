import { resolveRtcJoinFailureNotice } from './rtc-join-ack';

describe('rtc:join acknowledgement', () => {
  it('no muestra aviso cuando el join fue aceptado', () => {
    expect(resolveRtcJoinFailureNotice({ ok: true })).toBeNull();
  });

  it('avisa que la persona esta ocupada cuando el backend responde busy', () => {
    expect(resolveRtcJoinFailureNotice({ ok: false, reason: 'busy' })).toBe(
      'La persona esta en otra llamada.'
    );
  });

  it('avisa falta de permiso cuando el backend responde forbidden', () => {
    expect(resolveRtcJoinFailureNotice({ ok: false, reason: 'forbidden' })).toBe(
      'No tienes permiso para llamar en esta conversacion.'
    );
  });

  it('usa un aviso generico ante un motivo desconocido', () => {
    expect(resolveRtcJoinFailureNotice({ ok: false, reason: 'algo_nuevo' })).toBe(
      'No fue posible iniciar la llamada.'
    );
  });

  it('avisa cuando el ack nunca llega (timeout de socket.io)', () => {
    expect(
      resolveRtcJoinFailureNotice(undefined, new Error('operation has timed out'))
    ).toBe('El servidor de llamadas no respondio. Revisa tu conexion.');
  });

  it('no deja la llamada colgada si el ack llega vacio', () => {
    expect(resolveRtcJoinFailureNotice(undefined)).toBe('No fue posible iniciar la llamada.');
  });
});
