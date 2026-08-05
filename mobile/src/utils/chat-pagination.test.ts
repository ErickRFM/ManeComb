declare const __dirname: string;
const { readFileSync } = require('fs');
const { resolve } = require('path');

describe('chat pagination wiring', () => {
  it('uses the cursor endpoint and a single-flight older-page guard', () => {
    const client = readFileSync(resolve(__dirname, '../api/client.ts'), 'utf8');
    const store = readFileSync(resolve(__dirname, '../store/root-store.ts'), 'utf8');
    const view = readFileSync(
      resolve(__dirname, '../screens/chat/components/chat-screen-view.tsx'),
      'utf8'
    );
    expect(client).toContain('getMessagesPageRequest');
    expect(client).toContain('before: options.before');
    expect(store).toContain('isLoadingOlderChatByConversation[id]');
    expect(store).toContain('pageInfo.nextCursor');
    expect(view).toContain('maintainVisibleContentPosition');
  });
});
