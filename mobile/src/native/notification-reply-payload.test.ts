import {
  decryptDirectChatText,
  generateStoredChatKeyPair,
} from '@/src/utils/chat-e2ee';
import {
  buildInlineReplyPayload,
  parseStoredInlineReplyKeyPair,
} from '@/src/native/notification-reply-payload';

describe('notification inline reply payload', () => {
  it('keeps non-E2EE conversations on the normal plaintext contract', () => {
    const result = buildInlineReplyPayload({
      text: '  recibido  ',
      currentUserId: 'user-me',
      conversation: {
        id: 'conv-general',
        kind: 'group',
        encrypted: false,
        participants: [{ id: 'user-me' }, { id: 'user-peer' }],
      },
      storedKeyPair: null,
    });

    expect(result).toEqual({
      ok: true,
      encrypted: false,
      payload: { text: 'recibido' },
    });
  });

  it('encrypts RemoteInput text with the same direct-chat E2EE envelope as the app', () => {
    const sender = generateStoredChatKeyPair();
    const recipient = generateStoredChatKeyPair();
    const result = buildInlineReplyPayload({
      text: 'Voy en camino',
      currentUserId: 'user-me',
      conversation: {
        id: 'conv-direct',
        kind: 'direct',
        channelMode: 'chat',
        encrypted: true,
        participants: [
          { id: 'user-me', e2eePublicKey: sender.publicKey },
          { id: 'user-peer', e2eePublicKey: recipient.publicKey },
        ],
      },
      storedKeyPair: JSON.stringify(sender),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected encrypted inline reply');
    expect(result.encrypted).toBe(true);
    expect(result.payload.text).toBeUndefined();
    expect(result.payload.textPreview).toBe('Mensaje cifrado de extremo a extremo');
    expect(result.payload.e2eeEnvelope).toBeTruthy();

    const envelope = result.payload.e2eeEnvelope!;
    expect(
      decryptDirectChatText({
        envelope,
        peerPublicKey: sender.publicKey,
        currentUserSecretKey: recipient.secretKey,
      })
    ).toBe('Voy en camino');
  });

  it('fails closed instead of falling back to plaintext when the local E2EE key is unavailable', () => {
    const recipient = generateStoredChatKeyPair();
    const result = buildInlineReplyPayload({
      text: 'No debe salir en plano',
      currentUserId: 'user-me',
      conversation: {
        id: 'conv-direct',
        kind: 'direct',
        channelMode: 'chat',
        encrypted: true,
        participants: [
          { id: 'user-me' },
          { id: 'user-peer', e2eePublicKey: recipient.publicKey },
        ],
      },
      storedKeyPair: null,
    });

    expect(result).toEqual({
      ok: false,
      encrypted: true,
      reason: 'e2ee_key_unavailable',
    });
  });

  it('rejects malformed key material', () => {
    expect(parseStoredInlineReplyKeyPair('{broken')).toBeNull();
    expect(parseStoredInlineReplyKeyPair(JSON.stringify({ publicKey: 'x' }))).toBeNull();
  });
});
