declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
export {};

function section(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from).toBeGreaterThanOrEqual(0);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('shared presence contract', () => {
  const mobileStore = fs.readFileSync(path.join(__dirname, 'root-store.ts'), 'utf8');
  const portalStore = fs.readFileSync(
    path.join(__dirname, '../../../ventas/src/store/use-app-store.ts'),
    'utf8'
  );

  it('keeps Mobile periodic work heartbeat-only on the captured session socket', () => {
    const timer = section(
      mobileStore,
      'socketHeartbeatTimer = setInterval(() => {',
      'sessionSocket.connect();'
    );
    expect(timer).toContain('emitHeartbeat();');
    expect(timer).not.toContain('emitCurrentPresence');
    expect(mobileStore).toContain("sessionSocket.on('connect', () => {");
    expect(mobileStore).toContain('if (!isSocketSessionCurrent()) return;');
    expect(mobileStore).toContain('emitCurrentPresence(get);');

    // Solo existe un transporte Socket.IO; sessionSocket es la referencia
    // capturada de esa misma instancia para que los callbacks no crucen epochs.
    expect(mobileStore.match(/io\(SOCKET_URL/g) || []).toHaveLength(1);
  });

  it('keeps Portal alive beyond the 55-second lease on the existing socket', () => {
    expect(portalStore).toContain('const SOCKET_HEARTBEAT_MS = 20_000;');
    expect(portalStore).toContain("'client:heartbeat'");
    expect(portalStore).toContain('socketHeartbeatTimer = setInterval(emitHeartbeat, SOCKET_HEARTBEAT_MS);');
    const heartbeat = section(portalStore, 'const emitHeartbeat = () => {', "socket.on('connect'");
    expect(heartbeat).not.toContain('io(');
    expect(heartbeat).not.toContain('presence:join');
  });
});
