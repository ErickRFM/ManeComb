const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

function sourceBetween(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Unable to locate source segment: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe('mobile reconnect UI stability', () => {
  const mobileRoot = nodeProcess.cwd();

  it('keeps socket transport state separate from background reconciliation', () => {
    const rootStore = fs.readFileSync(path.join(mobileRoot, 'src', 'store', 'root-store.ts'), 'utf8');
    const reconnectRuntime = sourceBetween(
      rootStore,
      "socket.io.on('reconnect_attempt'",
      "socket.on('disconnect'"
    );

    expect(reconnectRuntime).toContain("setSocketTransition(set, 'connected', 'socket_reconnected'");
    expect(reconnectRuntime).toContain('Promise.allSettled([');
    expect(reconnectRuntime).not.toContain("networkStatus: 'recovering'");
    expect(reconnectRuntime).not.toContain("'socket_reconciling'");
    expect(reconnectRuntime).not.toContain("'socket_reconciled'");
  });

  it('debounces transient reconnect chrome and does not treat healthy connected socket as down', () => {
    const banner = fs.readFileSync(path.join(mobileRoot, 'src', 'components', 'connection-banner.tsx'), 'utf8');

    expect(banner).toContain('TRANSIENT_CONNECTION_NOTICE_DELAY_MS = 3500');
    expect(banner).toContain("socketStatus === 'connected' && heartbeatHealthy");
    expect(banner).toContain('setTimeout(() => {');
    expect(banner).toContain("? 'Reconectando...'");
  });

  it('renders the mobile connection notice outside normal page flow', () => {
    const shell = fs.readFileSync(path.join(mobileRoot, 'src', 'components', 'app-shell.tsx'), 'utf8');

    expect(shell).toContain('style={styles.connectionOverlay}');
    expect(shell).toContain("position: 'absolute'");
    expect(shell).toContain('zIndex: 40');
    expect(shell).toContain('const desktopConnectionBanner = isMobileLayout ? null : <ConnectionBanner />;');
  });

  it('does not refetch checklist history on object identity churn or hide valid cached records', () => {
    const checklist = fs.readFileSync(path.join(mobileRoot, 'src', 'screens', 'checklist-screen.tsx'), 'utf8');

    expect(checklist).toContain('const historyRefreshKey =');
    expect(checklist).toContain('semanticSessionChanged');
    expect(checklist).toContain('routeSessionHistory.length === 0');
    expect(checklist).toContain('historyLoadError && sessionHistory.length === 0');
    expect(checklist).toContain('loadSessionHistory().catch(() => undefined);');
    expect(checklist).toContain('[historyRefreshKey, loadSessionHistory, user]');
    expect(checklist).not.toContain('[loadSessionHistory, user, syncedActiveSession]');
    expect(checklist).not.toContain('void loadSessionHistory();');
    expect(checklist).toContain('bounces={false}');
    expect(checklist).toContain('overScrollMode="never"');
  });
});
