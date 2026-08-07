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
