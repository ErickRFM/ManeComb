import {
  decryptDirectChatText,
  decryptStoredChatKeyPairBackup,
  buildDirectChatMessagePayload,
  encryptDirectChatText,
  encryptStoredChatKeyPairBackup,
  generateStoredChatKeyPair,
  isDirectChatEncryptionActive,
  isE2eeCapablePublicKey,
} from './chat-e2ee';

describe('chat E2EE', () => {
  jest.setTimeout(30_000);

  it('genera pares X25519 validos y distintos', () => {
    const first = generateStoredChatKeyPair();
    const second = generateStoredChatKeyPair();
    expect(isE2eeCapablePublicKey(first.publicKey)).toBe(true);
    expect(first.secretKey).not.toBe(second.secretKey);
    expect(first.publicKey).not.toBe(second.publicKey);
  });

  describe('isDirectChatEncryptionActive (bloqueo de respuesta rapida)', () => {
    const peerKeys = generateStoredChatKeyPair();
    const directConversation = {
      kind: 'direct',
      channelMode: 'chat',
      encrypted: true,
      participants: [
        { id: 'me' },
        { id: 'peer', e2eePublicKey: peerKeys.publicKey },
      ],
    };

    it('detecta cifrado activo cuando el destinatario tiene llave usable', () => {
      expect(
        isDirectChatEncryptionActive({ currentUserId: 'me', conversation: directConversation })
      ).toBe(true);
    });

    it('permite responder si el destinatario no tiene llave (tampoco se cifraria en la app)', () => {
      expect(
        isDirectChatEncryptionActive({
          currentUserId: 'me',
          conversation: { ...directConversation, participants: [{ id: 'me' }, { id: 'peer' }] },
        })
      ).toBe(false);
    });

    it('permite responder en grupos y radio', () => {
      expect(
        isDirectChatEncryptionActive({
          currentUserId: 'me',
          conversation: { ...directConversation, kind: 'group' },
        })
      ).toBe(false);
      expect(
        isDirectChatEncryptionActive({
          currentUserId: 'me',
          conversation: { ...directConversation, channelMode: 'radio' },
        })
      ).toBe(false);
    });

    it('no marca cifrado una conversacion inexistente', () => {
      expect(isDirectChatEncryptionActive({ currentUserId: 'me', conversation: null })).toBe(false);
    });
  });

  it('cifra y descifra un mensaje directo de ida y vuelta', () => {
    const sender = generateStoredChatKeyPair();
    const recipient = generateStoredChatKeyPair();
    const envelope = encryptDirectChatText({
      text: 'mensaje privado', recipientId: 'recipient-1',
      recipientPublicKey: recipient.publicKey, senderPublicKey: sender.publicKey,
      senderSecretKey: sender.secretKey,
    });
    expect(envelope.ciphertext).not.toContain('mensaje privado');
    expect(decryptDirectChatText({ envelope, peerPublicKey: sender.publicKey,
      currentUserSecretKey: recipient.secretKey })).toBe('mensaje privado');
  });

  it('compone E2EE solo para chat directo con ambas llaves', () => {
    const sender = generateStoredChatKeyPair();
    const recipient = generateStoredChatKeyPair();
    const direct = buildDirectChatMessagePayload({
      text: 'secreto', currentUserId: 'sender', keyPair: sender,
      conversation: { kind: 'direct', channelMode: 'chat', participants: [
        { id: 'sender', e2eePublicKey: sender.publicKey },
        { id: 'recipient', e2eePublicKey: recipient.publicKey },
      ] },
    });
    const radio = buildDirectChatMessagePayload({
      text: 'operativo', currentUserId: 'sender', keyPair: sender,
      conversation: { kind: 'direct', channelMode: 'radio', participants: [
        { id: 'sender', e2eePublicKey: sender.publicKey },
        { id: 'recipient', e2eePublicKey: recipient.publicKey },
      ] },
    });
    expect(direct).toHaveProperty('e2eeEnvelope.ciphertext');
    expect(direct).not.toHaveProperty('text');
    expect(radio).toEqual({ text: 'operativo' });
  });

  it('rechaza limpiamente una contrasena incorrecta para el respaldo', async () => {
    const backup = await encryptStoredChatKeyPairBackup({ keyPair: generateStoredChatKeyPair(),
      userId: 'user-1', password: 'correcta-segura', deviceId: 'device-1' });
    await expect(decryptStoredChatKeyPairBackup({ backup, userId: 'user-1',
      password: 'incorrecta' })).rejects.toThrow('No fue posible restaurar');
  });

  it('usa una sal nueva para el mismo usuario y contrasena', async () => {
    const keyPair = generateStoredChatKeyPair();
    const input = { keyPair, userId: 'user-1', password: 'misma-contrasena-segura',
      deviceId: 'device-1' };
    const first = await encryptStoredChatKeyPairBackup(input);
    const second = await encryptStoredChatKeyPairBackup(input);
    expect(first.salt).not.toBe(second.salt);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    await expect(decryptStoredChatKeyPairBackup({ backup: first, userId: input.userId,
      password: input.password })).resolves.toEqual(keyPair);
  });
});
