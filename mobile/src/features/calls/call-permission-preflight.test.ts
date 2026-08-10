const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('RTC media permission preflight placement', () => {
  const root = nodeProcess.cwd();
  const chatScreen = fs.readFileSync(path.join(root, 'src', 'screens', 'chat-screen.tsx'), 'utf8');
  const incomingModal = fs.readFileSync(
    path.join(root, 'src', 'features', 'calls', 'components', 'incoming-call-modal.tsx'),
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

  it('gates outgoing signaling before controller.startCall', () => {
    const permissionIndex = chatScreen.indexOf('ensureCallMediaPermissionsForUi(mode)');
    const startIndex = chatScreen.indexOf('controller.startCall(mode)');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeGreaterThan(permissionIndex);
    expect(chatScreen).toContain('if (!granted) return;');
  });

  it('gates manual incoming accept before backend accept', () => {
    const permissionIndex = incomingModal.indexOf('ensureCallMediaPermissionsForUi');
    const acceptIndex = incomingModal.indexOf('await acceptIncomingCall()');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(acceptIndex).toBeGreaterThan(permissionIndex);
    expect(incomingModal).toContain("phase === 'INCOMING_RINGING'");
  });

  it('gates notification accept before backend accept', () => {
    const permissionIndex = callOverlay.indexOf('ensureCallMediaPermissionsForUi');
    const acceptIndex = callOverlay.indexOf('acceptIncomingCall()');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(acceptIndex).toBeGreaterThan(permissionIndex);
  });

  it('keeps a final permission defense at getUserMedia boundary', () => {
    const permissionIndex = callMedia.indexOf('assertCallMediaPermissions(mode)');
    const mediaIndex = callMedia.indexOf('mediaDevices.getUserMedia');
    expect(permissionIndex).toBeGreaterThan(-1);
    expect(mediaIndex).toBeGreaterThan(permissionIndex);
  });
});
