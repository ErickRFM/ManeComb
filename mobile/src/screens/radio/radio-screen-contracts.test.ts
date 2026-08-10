import { getProgressBarFill } from './utils/radio-format';

describe('radio screen history contracts', () => {
  it('keeps REST and Socket radio history on the same merge path', () => {
    const fs = jest.requireActual('fs') as {
      readFileSync: (filePath: string, encoding: string) => string;
    };
    const rootStoreSource = fs.readFileSync(
      'src/store/root-store.ts',
      'utf8'
    );
    const radioScreenSource = fs.readFileSync(
      'src/screens/radio/radio-screen-view.tsx',
      'utf8'
    );

    expect(rootStoreSource).toContain(
      '[conversationId]: mergeConversationMessages(current, [message])'
    );
    expect(rootStoreSource).toMatch(
      /const messagesById = new Map\(current\.map\(\(message\) => \[message\.id, message\]\)\);[\s\S]*incoming\.forEach\(\(message\) => messagesById\.set\(message\.id, message\)\)/
    );
    expect(rootStoreSource).toContain('function joinCurrentConversationRooms');
    expect(rootStoreSource).toMatch(
      /if \(socket && socketSessionKey === nextSessionKey\) \{[\s\S]*joinCurrentConversationRooms\(get\);[\s\S]*return;/
    );
    expect(rootStoreSource).not.toContain('refreshMissingConversation');
    expect(radioScreenSource).toContain(
      'return byDate || right.message.id.localeCompare(left.message.id);'
    );
    expect(radioScreenSource).toContain('const ensureRadioHistoryLoaded = useCallback');
    expect(radioScreenSource).toContain('historyLoadInFlightRef.current.has(channelId)');
    expect(radioScreenSource).toContain('messagesByConversation[channelId] !== undefined');
    expect(radioScreenSource).toContain("conversation.kind === 'group'");
    expect(radioScreenSource).toContain('generalRadioChannel?.id || radioChannels[0].id');
    expect(radioScreenSource).toContain('bootstrappedRef.current = false;');
  });

  it.each([0, 0.01, 0.125, 0.5, 0.731, 1])(
    'illuminates waveform bars in exact proportion to progress %s',
    (progress) => {
      const barCount = 18;
      const illuminatedArea = Array.from({ length: barCount }, (_, index) =>
        getProgressBarFill(progress, index, barCount)
      ).reduce((sum, fill) => sum + fill, 0);

      expect(illuminatedArea).toBeCloseTo(progress * barCount, 10);
    }
  );
});

describe('Radio Pro console projection contracts', () => {
  const fs = jest.requireActual('fs') as {
    readFileSync: (filePath: string, encoding: string) => string;
  };
  const viewSource = fs.readFileSync('src/screens/radio/radio-screen-view.tsx', 'utf8');
  const styleSource = fs.readFileSync('src/screens/radio/radio-screen.styles.ts', 'utf8');

  it('uses the available height for a direct PTT-first console and hides redundant chrome', () => {
    const heroCardStyles = styleSource.slice(
      styleSource.indexOf('heroCard:'),
      styleSource.indexOf('heroTopRow:')
    );
    const heroCopyStyles = styleSource.slice(
      styleSource.indexOf('heroCopy:'),
      styleSource.indexOf('heroEyebrow:')
    );
    const operationalBannerStyles = styleSource.slice(
      styleSource.indexOf('operationalBanner:'),
      styleSource.indexOf('operationalIcon:')
    );

    expect(viewSource).toContain('ManeComb Radio Pro');
    expect(viewSource).toContain('styles.operationalState');
    expect(styleSource).toContain('consolePageContent:');
    expect(heroCardStyles).toContain('flexGrow: 1');
    expect(heroCardStyles).not.toContain("justifyContent: 'space-between'");
    expect(heroCopyStyles).toContain("display: 'none'");
    expect(operationalBannerStyles).toContain("display: 'none'");
  });

  it('uses real TX metering and no fabricated RX waveform or duplicate player', () => {
    expect(viewSource).toContain('{isCapturing ? (');
    expect(viewSource).toContain('<PttAudioWave');
    expect(viewSource).toContain('subscribeToPttAudioLevel');
    expect(viewSource).not.toContain('rxWaveform');
    expect(viewSource).not.toContain('Audio.Sound.createAsync');
  });

  it('keeps receiving and busy UI derived from the canonical console state', () => {
    expect(viewSource).toContain('deriveLiveConsole({');
    expect(viewSource).toContain('radioPhase === \'RECEIVING\'');
    expect(viewSource).toContain('disabled={consoleState.pttDisabled}');
    expect(viewSource).not.toMatch(/useState\([^\n]*(receiving|transmitting|channelBusy)/i);
  });

  it('keeps the full route label responsive and sourced from audio authority', () => {
    expect(viewSource).toContain('getRadioRouteLabel(audioRoute.active)');
    expect(viewSource).toContain('styles.routeChipText');
    expect(viewSource).toContain('adjustsFontSizeToFit');
    expect(styleSource).toMatch(/deviceCompactChip:\s*\{[\s\S]*?maxWidth: isPhone \? 132 : 168/);
  });

  it('exposes named pager tabs through the existing goToPage path', () => {
    expect(viewSource).toContain('RADIO_PAGES.map');
    expect(viewSource).toContain('accessibilityRole="tab"');
    expect(viewSource).toContain('onPress={() => goToPage(index as RadioPageIndex)}');
    expect(viewSource).toContain('{label}');
  });

  it('derives last transmission from loadedVoiceNotes and routes to Audios', () => {
    expect(viewSource).toContain('const lastTransmission = loadedVoiceNotes[0] || null;');
    expect(viewSource).toContain("setAudioFilter(activeChannel ? 'current' : 'all')");
    expect(viewSource).toContain('goToPage(2);');
  });
});
