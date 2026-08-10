import fs from 'node:fs';
import path from 'node:path';

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

/**
 * El cableado del socket vive dentro de `connectSocket`, que no se puede
 * importar bajo Jest sin una capa de mocks nativos que el repositorio no tiene.
 * Estos asserts son sobre fuente: evidencia mas debil que una prueba de
 * comportamiento, y se declara como tal. El comportamiento de la politica si
 * esta cubierto por pruebas reales, en JVM (ManeCombAlertPolicyTest) y en
 * operational-alert.test.ts.
 */
describe('cableado de alertas operativas en el socket', () => {
  const store = source('./root-store.ts');

  it('consume notification:created e incident:sos', () => {
    expect(store).toContain("socket.on('notification:created'");
    expect(store).toContain("socket.on('incident:sos'");
    expect(store).toContain('toOperationalAlertFromNotification');
    expect(store).toContain('toOperationalAlertFromSos');
  });

  it('reutiliza el socket existente sin abrir otro bus', () => {
    const connections = store.match(/io\(SOCKET_URL/g) || [];
    expect(connections).toHaveLength(1);
  });

  it('no hace sonar un cambio de estado', () => {
    const updated = store.slice(
      store.indexOf("socket.on('incident:updated'"),
      store.indexOf("socket.on('incident:updated'") + 400
    );
    expect(updated).not.toContain('playOperationalAlertFeedback');
  });

  it('delega el feedback en la politica nativa y no decide gravedad', () => {
    const created = store.slice(
      store.indexOf("socket.on('notification:created'"),
      store.indexOf("socket.on('incident:sos'")
    );
    expect(created).toContain('playOperationalAlertFeedback');
    // Ninguna traduccion local de severidad a canal/sonido.
    expect(created).not.toContain('critical');
    expect(created).not.toContain('CHANNEL_');
  });
});
