const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('chat and call physical regressions', () => {
  const mobileRoot = nodeProcess.cwd();

  it('preserves the selected direct conversation across a Chat remount', () => {
    const chatScreen = fs.readFileSync(
      path.join(mobileRoot, 'src', 'screens', 'chat-screen.tsx'),
      'utf8'
    );

    expect(chatScreen).toContain(
      'const pinnedConversationIdRef = useRef<string | null>(activeConversationId);'
    );
    expect(chatScreen).toContain('shouldRestorePinnedConversation({');
  });

  it('keeps both native video surfaces mounted and gives the local preview a higher z-order', () => {
    const activeCall = fs.readFileSync(
      path.join(mobileRoot, 'src', 'features', 'calls', 'components', 'active-call-modal.tsx'),
      'utf8'
    );

    expect(activeCall).toContain('const hasStream = Boolean(stream);');
    expect(activeCall).toContain('RTCView && hasStream');
    expect(activeCall).toContain('zOrder={0}');
    expect(activeCall).toContain('zOrder={1}');
    expect(activeCall).toContain('zIndex: 2');
    expect(activeCall).not.toContain('RTCView && hasLiveVideo');
  });

  it('exposes an Android speaker toggle without borrowing the Radio audio-route authority', () => {
    const activeCall = fs.readFileSync(
      path.join(mobileRoot, 'src', 'features', 'calls', 'components', 'active-call-modal.tsx'),
      'utf8'
    );
    const callService = fs.readFileSync(
      path.join(mobileRoot, 'src', 'native', 'call-service.ts'),
      'utf8'
    );
    const nativeCallModule = fs.readFileSync(
      path.join(
        mobileRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'anonymous',
        'combiscontrol',
        'calls',
        'ManeCombCallModule.kt'
      ),
      'utf8'
    );

    expect(activeCall).toContain("Platform.OS === 'android'");
    expect(activeCall).toContain('setCallSpeakerEnabled');
    expect(activeCall).toContain('resetCallAudioRoute');
    expect(activeCall).toContain("speakerEnabled ? 'Auricular' : 'Altavoz'");
    expect(callService).toContain('setCallSpeakerEnabled?:');
    expect(callService).toContain('resetCallAudioRoute?:');
    expect(nativeCallModule).toContain('AudioManager.MODE_IN_COMMUNICATION');
    expect(nativeCallModule).toContain('setCommunicationDevice');
    expect(nativeCallModule).toContain('clearCommunicationDevice');
    expect(nativeCallModule).toContain('isSpeakerphoneOn');
  });
});
