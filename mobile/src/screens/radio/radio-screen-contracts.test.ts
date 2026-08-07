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
