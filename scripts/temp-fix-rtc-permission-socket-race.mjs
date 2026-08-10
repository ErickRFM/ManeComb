import fs from 'node:fs';

const storeFile = 'mobile/src/features/calls/call-store.ts';
let store = fs.readFileSync(storeFile, 'utf8');
const from = `      const socket = state._socket;
      if (!socket) return { ok: false, code: 'no_socket' };

      set({ _starting: true });
      try {
        const permissionsReady = await ensureMediaPermissions({
          kind: 'outgoing',
          conversationId,
          mode,
        });
        if (!permissionsReady) return { ok: false, code: 'media_permission_required' };
        if (!isIdle(get())) return { ok: false, code: 'busy_local' };

        const ack = await emitStartCall(socket, { conversationId, mode });`;
const to = `      if (!state._socket) return { ok: false, code: 'no_socket' };

      set({ _starting: true });
      try {
        const permissionsReady = await ensureMediaPermissions({
          kind: 'outgoing',
          conversationId,
          mode,
        });
        if (!permissionsReady) return { ok: false, code: 'media_permission_required' };

        // Permission prompts can outlive a Socket.IO reconnect. Never signal on
        // the socket captured before await: re-read the current authority after
        // the async preflight and fail closed if no live socket remains bound.
        const currentBeforeStart = get();
        if (!isIdle(currentBeforeStart)) return { ok: false, code: 'busy_local' };
        const socket = currentBeforeStart._socket;
        if (!socket) return { ok: false, code: 'no_socket' };

        const ack = await emitStartCall(socket, { conversationId, mode });`;
if (!store.includes(from)) throw new Error('startCall preflight block changed; refusing blind patch');
store = store.replace(from, to);
fs.writeFileSync(storeFile, store);

const testFile = 'mobile/src/features/calls/call-store.test.ts';
let test = fs.readFileSync(testFile, 'utf8');
const anchor = `  it('busy/direct_call_required no crean una sesion local', async () => {`;
if (!test.includes(anchor)) throw new Error('call-store test anchor changed');
const regression = `  it('relee el socket despues del permiso y nunca señaliza por un socket reemplazado', async () => {
    let resolvePermissions: ((value: CallMediaPermissionResult) => void) | null = null;
    __setCallPermissionRequesterForTests(() =>
      new Promise<CallMediaPermissionResult>((resolve) => {
        resolvePermissions = resolve;
      })
    );
    const first = fakeSocket();
    const second = fakeSocket();
    first.setNextAck({ ok: true, callId: 'stale-call' });
    second.setNextAck({ ok: true, callId: 'fresh-call' });
    state().bindSocket(first as any);

    const starting = state().startCall({ conversationId: 'conv-1', mode: 'audio' });
    expect(state()._starting).toBe(true);
    state().bindSocket(second as any);
    resolvePermissions!(grantedAudioPermissions);

    const result = await starting;
    expect(result).toEqual({ ok: true });
    expect(first.emitted.filter((entry) => entry.event === 'rtc:call')).toHaveLength(0);
    expect(second.emitted.filter((entry) => entry.event === 'rtc:call')).toHaveLength(1);
    expect(state().callId).toBe('fresh-call');
    expect(state()._starting).toBe(false);
  });

`;
test = test.replace(anchor, regression + anchor);
fs.writeFileSync(testFile, test);
