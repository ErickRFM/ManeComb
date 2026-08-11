import {
  buildDirectChatMessagePayload,
  isDirectChatEncryptionActive,
  type StoredChatKeyPair,
} from '@/src/utils/chat-e2ee';

export const E2EE_INLINE_REPLY_KEY_PREFIX = 'combis-e2ee-keypair:';

export type InlineReplyConversation = {
  id: string;
  kind?: string;
  channelMode?: string;
  encrypted?: boolean;
  participants?: Array<{ id: string; e2eePublicKey?: string }>;
};

export type InlineReplyPayload = {
  text?: string;
  textPreview?: string;
  e2eeEnvelope?: {
    version: string;
    nonce: string;
    ciphertext: string;
    recipientId: string;
    senderPublicKey?: string;
  } | null;
};

export type InlineReplyBuildResult =
  | { ok: true; encrypted: boolean; payload: InlineReplyPayload }
  | { ok: false; encrypted: true; reason: 'e2ee_key_unavailable' | 'e2ee_envelope_unavailable' };

export function parseStoredInlineReplyKeyPair(raw: string | null | undefined): StoredChatKeyPair | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredChatKeyPair;
    return parsed?.publicKey && parsed?.secretKey ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Builds the exact same outgoing payload as ChatScreen/root-store, but without
 * depending on Zustand being hydrated. This is what makes Android RemoteInput
 * safe for E2EE conversations while the app is backgrounded or killed.
 *
 * Security rule: once the conversation is E2EE-capable, this function never
 * falls back to plaintext. Missing/invalid local key material fails closed.
 */
export function buildInlineReplyPayload(input: {
  text: string;
  currentUserId: string;
  conversation: InlineReplyConversation | null;
  storedKeyPair: string | null | undefined;
}): InlineReplyBuildResult {
  const text = input.text.trim();
  const encryptionActive = isDirectChatEncryptionActive({
    currentUserId: input.currentUserId,
    conversation: input.conversation,
  });

  if (!encryptionActive) {
    return { ok: true, encrypted: false, payload: { text } };
  }

  const keyPair = parseStoredInlineReplyKeyPair(input.storedKeyPair);
  if (!keyPair) {
    return { ok: false, encrypted: true, reason: 'e2ee_key_unavailable' };
  }

  const payload = buildDirectChatMessagePayload({
    text,
    currentUserId: input.currentUserId,
    conversation: input.conversation
      ? {
          kind: input.conversation.kind || '',
          channelMode: input.conversation.channelMode,
          participants: input.conversation.participants || [],
        }
      : null,
    keyPair,
  });

  if (!payload.e2eeEnvelope) {
    return { ok: false, encrypted: true, reason: 'e2ee_envelope_unavailable' };
  }

  return { ok: true, encrypted: true, payload };
}
