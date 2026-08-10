const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('RTC media permission preflight placement', () => {
  const root = nodeProcess.cwd();
  const callStore = fs.readFileSync(
    path.join(root, 'src', 'features', 'calls', 'call-store.ts'),
    'utf8'
  );
  const callOverlay = fs.readFileSync(
    path.join(root, 'src', 'features', 'calls', 'call-overlay.tsx'),
    'utf8'
  );
  const callMedia = fs.readFileSync(
    path.join(root, 'src', 'features', 'calls', 'call-media.ts'),
    'utf8'
  );

  it('gates outgoing signaling in the store before emitStartCall', () => {
    const startBlock = callStore.slice(callStore.indexOf('startCall: async'));
    const permissionIndex = startBlock.indexOf('ensureMediaPermissions');
    const signalIndex = startBlock.indexOf('emitStartCall');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(signalIndex).toBeGreaterThan(permissionIndex);
    expect(startBlock).toContain("code: 'media_permission_required'");
  });

  it('gates incoming accept in the store before LOCAL_ACCEPT and emitAccept', () => {
    const acceptBlock = callStore.slice(callStore.indexOf('acceptIncomingCall: async'));
    const permissionIndex = acceptBlock.indexOf('ensureMediaPermissions');
    const localAcceptIndex = acceptBlock.indexOf("type: 'LOCAL_ACCEPT'");
    const signalIndex = acceptBlock.indexOf('emitAccept');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(localAcceptIndex).toBeGreaterThan(permissionIndex);
    expect(signalIndex).toBeGreaterThan(localAcceptIndex);
  });

  it('routes push accept through the same store authority', () => {
    expect(callOverlay).toContain('useCallStore.getState().acceptIncomingCall()');
    expect(callOverlay).toContain('<CallPermissionModal />');
    expect(callOverlay).not.toContain('ensureCallMediaPermissionsForUi');
  });

  it('delays microphone/camera foreground service until local media exists', () => {
    expect(callOverlay).toContain('const localStream = useCallStore');
    expect(callOverlay).toContain('hasActiveCallPhase && Boolean(localStream)');
  });

  it('keeps a final permission defense at the actual getUserMedia invocation', () => {
    const permissionIndex = callMedia.indexOf('assertCallMediaPermissions(mode)');
    // El módulo también referencia getUserMedia en el guard de disponibilidad,
    // por eso se fija la última ocurrencia, que corresponde a la captura real.
    const mediaIndex = callMedia.lastIndexOf('mediaDevices.getUserMedia');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(permissionIndex);
  });
});
