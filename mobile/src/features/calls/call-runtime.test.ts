// RC-MOBILE-CALLS-PRODUCTION-01 Bloque C — Reglas deterministas: ICE config, offerer, cola ICE,
// condicion CONNECTED, epoch/cleanup.

import { iceConfigDiagnostics, resolveIceConfig, validateIceConfig } from './call-ice';
import { createCallEpoch, createIdempotentCleanup } from './call-cleanup';
import { createIceQueue, evaluateConnected, isCanonicalOfferer, remoteAudioSignals } from './call-peer';

describe('call-ice (C.4)', () => {
  it('STUN-only es valido (turnEnabled false)', () => {
    const r = validateIceConfig({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], turnEnabled: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.turnEnabled).toBe(false);
  });
  it('STUN+TURN es valido (turnEnabled true)', () => {
    const r = validateIceConfig({ iceServers: [{ urls: 'stun:s' }, { urls: 'turn:t', username: 'u', credential: 'c' }], turnEnabled: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.turnEnabled).toBe(true);
  });
  it('config vacia/invalida => rtc_config_unavailable (sin fallback STUN)', () => {
    expect(validateIceConfig({ iceServers: [] }).ok).toBe(false);
    expect(validateIceConfig(null).ok).toBe(false);
    expect(validateIceConfig({ iceServers: [{ urls: '' }] } as any).ok).toBe(false);
  });
  it('resolveIceConfig: fallo del fetch => no disponible (no inventa STUN)', async () => {
    const r = await resolveIceConfig(async () => {
      throw new Error('network');
    });
    expect(r).toEqual({ ok: false, code: 'rtc_config_unavailable' });
  });
  it('diagnostico sanitizado: solo turnEnabled + conteo (sin credenciales)', () => {
    const r = validateIceConfig({ iceServers: [{ urls: 'turn:t', username: 'secret', credential: 'secret' }], turnEnabled: true });
    const diag = iceConfigDiagnostics(r);
    expect(diag).toEqual({ turnEnabled: true, iceServerCount: 1 });
    expect(JSON.stringify(diag)).not.toContain('secret');
  });
});

describe('call-peer negociacion (C.5)', () => {
  it('el caller (outgoing) es el offerer canonico; el callee no', () => {
    expect(isCanonicalOfferer('outgoing')).toBe(true);
    expect(isCanonicalOfferer('incoming')).toBe(false);
    expect(isCanonicalOfferer(null)).toBe(false);
  });

  it('cola ICE: encola antes de remote, drena en orden despues; otra llamada se ignora', () => {
    const q = createIceQueue<string>('call-1');
    expect(q.add('call-1', 'a')).toBe(true);
    expect(q.add('call-1', 'b')).toBe(true);
    expect(q.add('call-2', 'x')).toBe(false); // otro callId -> ignorado
    expect(q.size()).toBe(2);
    expect(q.drain()).toEqual([]); // aun no hay remote description
    q.markRemoteReady();
    expect(q.drain()).toEqual(['a', 'b']); // en orden
    expect(q.size()).toBe(0);
  });

  it('reset re-vincula el callId y limpia', () => {
    const q = createIceQueue<string>('call-1');
    q.add('call-1', 'a');
    q.reset('call-2');
    expect(q.isRemoteReady()).toBe(false);
    expect(q.add('call-1', 'z')).toBe(false);
    expect(q.add('call-2', 'z')).toBe(true);
  });
});

describe('condicion CONNECTED (C.6)', () => {
  const live = { participantCount: 2, connectionState: 'connected', hasRemoteAudioTrack: true, remoteAudioTrackLive: true };
  it('exige las cuatro condiciones simultaneas', () => {
    expect(evaluateConnected(live)).toBe(true);
  });
  it('ninguna senal por si sola conecta', () => {
    expect(evaluateConnected({ ...live, participantCount: 1 })).toBe(false); // solo participants
    expect(evaluateConnected({ ...live, connectionState: 'connecting' })).toBe(false); // solo connectionState
    expect(evaluateConnected({ ...live, hasRemoteAudioTrack: false })).toBe(false); // ontrack ausente
    expect(evaluateConnected({ ...live, remoteAudioTrackLive: false })).toBe(false); // track no live
  });
  it('remoteAudioSignals deriva de getAudioTracks', () => {
    expect(remoteAudioSignals(null)).toEqual({ hasRemoteAudioTrack: false, remoteAudioTrackLive: false });
    expect(remoteAudioSignals({ getAudioTracks: () => [{ readyState: 'live' }] })).toEqual({ hasRemoteAudioTrack: true, remoteAudioTrackLive: true });
    expect(remoteAudioSignals({ getAudioTracks: () => [{ readyState: 'ended' }] })).toEqual({ hasRemoteAudioTrack: true, remoteAudioTrackLive: false });
  });
});

describe('epoch + cleanup (C.9)', () => {
  it('el guard ignora callbacks de una llamada vieja', () => {
    const epoch = createCallEpoch();
    const e1 = epoch.next('call-1');
    let calls = 0;
    const cb = epoch.guard(e1, () => { calls += 1; });
    cb();
    expect(calls).toBe(1);
    epoch.next('call-2'); // llamada nueva -> e1 queda viejo
    cb();
    expect(calls).toBe(1); // no se ejecuto para la vieja
  });
  it('cleanup idempotente: corre una vez y no falla al repetir', () => {
    let a = 0;
    const cleanup = createIdempotentCleanup([
      () => { a += 1; },
      () => { throw new Error('boom'); }, // no debe propagar
      () => { a += 10; },
    ]);
    cleanup();
    cleanup();
    expect(a).toBe(11);
  });
});
