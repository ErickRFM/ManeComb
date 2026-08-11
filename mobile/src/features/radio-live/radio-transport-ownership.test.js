const fs = require('node:fs');
const path = require('node:path');

const MOBILE_ROOT = path.resolve(__dirname, '../../..');
const JS_ROOTS = ['src'];
const KOTLIN_ROOT = path.join(
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'anonymous',
  'combiscontrol'
);

function walk(directory, matcher, found = []) {
  const absolute = path.join(MOBILE_ROOT, directory);
  if (!fs.existsSync(absolute)) return found;

  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(relative, matcher, found);
      continue;
    }
    if (!matcher(entry.name)) continue;
    found.push({
      file: relative.replace(/\\/g, '/'),
      source: fs.readFileSync(path.join(MOBILE_ROOT, relative), 'utf8'),
    });
  }
  return found;
}

const jsSources = JS_ROOTS.flatMap((root) =>
  walk(root, (name) => /\.(ts|tsx|js|jsx)$/.test(name) && !name.includes('.test.'))
);
const kotlinSources = walk(KOTLIN_ROOT, (name) => name.endsWith('.kt'));

function jsFilesContaining(pattern) {
  return jsSources.filter(({ source }) => pattern.test(source)).map(({ file }) => file);
}

function kotlinFilesContaining(pattern) {
  return kotlinSources.filter(({ source }) => pattern.test(source)).map(({ file }) => file);
}

describe('Radio transport ownership lives in Android', () => {
  it('leaves no JavaScript producer or consumer of the radio protocol', () => {
    // Si JavaScript volviera a hablar radio:*, existirian dos transportes para la
    // misma sesion y el arbitraje del backend dejaria de ser univoco.
    expect(jsFilesContaining(/['"]radio:(join|leave|start|frame|end)['"]/)).toEqual([]);
  });

  it('keeps the PTT media path out of the React Native bridge', () => {
    for (const symbol of [
      'startPttCapture',
      'stopPttCapture',
      'startPttPlayback',
      'enqueuePttFrame',
      'ManeCombPttFrame',
    ]) {
      expect(jsFilesContaining(new RegExp(symbol))).toEqual([]);
    }
  });

  it('keeps RX frame bookkeeping off main-thread and React publications', () => {
    const controller = kotlinSources.find(({ file }) => file.endsWith('RadioSessionController.kt'));
    expect(controller.source).toContain(
      'applyState(RadioEvent.RemoteFrame(transmissionId, clock()), publish = false)'
    );
    expect(controller.source).toContain('if (publish) onStateChanged(next)');
  });

  it('keeps a single Socket.IO Radio client, implemented natively', () => {
    const kotlinTransports = kotlinFilesContaining(/io\.socket\.client\.Socket/);
    expect(kotlinTransports).toEqual([
      'android/app/src/main/java/com/anonymous/combiscontrol/audio/SocketIoRadioTransport.kt',
    ]);
  });

  it('keeps a single AudioRecord and a single AudioTrack for Radio', () => {
    expect(kotlinFilesContaining(/AudioRecord\(/)).toEqual([
      'android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioAudioSession.kt',
    ]);
    expect(kotlinFilesContaining(/AudioTrack\.Builder\(\)/)).toEqual([
      'android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioAudioSession.kt',
    ]);
  });

  it('keeps one reconnect algorithm and disables the transport built-in one', () => {
    const transport = kotlinSources.find(({ file }) => file.endsWith('SocketIoRadioTransport.kt'));
    expect(transport.source).toContain('reconnection = false');
    expect(kotlinFilesContaining(/class RadioReconnectPolicy/)).toEqual([
      'android/app/src/main/java/com/anonymous/combiscontrol/audio/RadioReconnectPolicy.kt',
    ]);
  });

  it('builds a fresh socket manager on every connect', () => {
    // IO.socket() cachea el Manager por URI: sin forceNew, reconectar o cambiar
    // de cuenta reutilizaria el handshake (y el token) anterior.
    const transport = kotlinSources.find(({ file }) => file.endsWith('SocketIoRadioTransport.kt'));
    expect(transport.source).toContain('forceNew = true');
    expect(transport.source).toContain('multiplex = false');
  });

  it('authenticates exactly like the shared JavaScript socket', () => {
    // Backend: socket.handshake.auth.token, JWT crudo sin prefijo Bearer.
    const transport = kotlinSources.find(({ file }) => file.endsWith('SocketIoRadioTransport.kt'));
    expect(transport.source).toContain('auth = mapOf("token" to credentials.token)');
    expect(transport.source).not.toContain('Bearer');
    expect(transport.source).not.toContain('Authorization');
  });

  it('confines the whole radio session to one thread', () => {
    // El estado lo tocan el hilo de React, el de Socket.IO y el de captura.
    const controller = kotlinSources.find(({ file }) => file.endsWith('RadioSessionController.kt'));
    expect(controller.source).toContain('confine');
    const service = kotlinSources.find(({ file }) => file.endsWith('ManeCombRadioService.kt'));
    expect(service.source).toContain('HandlerThread("ManeCombRadioSession")');
    expect(service.source).toContain('confine = { action -> sessionHandler.post(action) }');
  });

  it('takes the socket URL from the same configuration as the JavaScript socket', () => {
    const overlay = fs.readFileSync(
      path.join(MOBILE_ROOT, 'src/features/radio-live/radio-live-overlay.tsx'),
      'utf8'
    );
    expect(overlay).toContain("import { SOCKET_URL } from '@/src/api/client'");
    // Ninguna URL de desarrollo puede quedar fijada en el camino nativo.
    for (const { file, source } of [
      ...kotlinSources,
      { file: 'overlay', source: overlay },
    ]) {
      expect({ file, hasHardcodedHost: /localhost|10\.0\.2\.2|127\.0\.0\.1/.test(source) })
        .toEqual({ file, hasHardcodedHost: false });
    }
  });

  it('removes the substituted JavaScript transport and its foreground coordinator', () => {
    for (const removed of [
      'src/features/radio-live/radio-realtime-service.ts',
      'src/features/radio-live/radio-live-machine.ts',
      'src/features/radio-live/radio-foreground-service.ts',
    ]) {
      expect(fs.existsSync(path.join(MOBILE_ROOT, removed))).toBe(false);
    }
  });

  it('never lets the Radio screen own transport or audio', () => {
    const screen = fs.readFileSync(
      path.join(MOBILE_ROOT, 'src/screens/radio/radio-screen-view.tsx'),
      'utf8'
    );
    for (const forbidden of [
      'RadioRealtimeService',
      'getSharedRealtimeSocket',
      'useSharedRealtimeSocket',
      'radioSessionReducer',
    ]) {
      expect(screen).not.toContain(forbidden);
    }
  });

  it('does not attach Radio to the shared JavaScript socket any more', () => {
    // El socket compartido sigue sirviendo a Chat, Presencia, Llamadas y GPS;
    // lo que ya no puede hacer es transportar Radio.
    expect(jsFilesContaining(/useSharedRealtimeSocket|getSharedRealtimeSocket/)).not.toContain(
      'src/features/radio-live/radio-live-overlay.tsx'
    );
    const overlay = fs.readFileSync(
      path.join(MOBILE_ROOT, 'src/features/radio-live/radio-live-overlay.tsx'),
      'utf8'
    );
    // La unica mencion admisible es la URL del servidor que se entrega al nativo.
    expect(overlay).toContain('SOCKET_URL');
    expect(overlay).not.toMatch(/socket\.(on|off|emit)/);
  });
});
