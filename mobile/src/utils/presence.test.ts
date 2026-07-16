import { buildPresenceSnapshot, getPresencePresentation, getPresenceStatus } from './presence';

describe('presence SSOT', () => {
  it('no inventa online antes de recibir presencia', () => {
    expect(getPresenceStatus({}, 'user-1')).toBe('unknown');
    expect(getPresencePresentation('unknown').label).toBe('Sin confirmar');
  });

  it('convierte el snapshot completo en una unica tabla', () => {
    expect(buildPresenceSnapshot(['u1', 'u2', 'u3'], ['u2', 'u3'])).toEqual({
      u1: 'offline', u2: 'online', u3: 'online',
    });
  });

  it('mantiene offline explicito separado de desconocido', () => {
    expect(getPresenceStatus({ u1: 'offline' }, 'u1')).toBe('offline');
    expect(getPresenceStatus({}, 'u1')).toBe('unknown');
  });
});
