export type ConversationKind = 'group' | 'direct';
export type ConversationChannelMode = 'chat' | 'radio';
export type ChatMessageKind = 'text' | 'audio' | 'image' | 'video';
export type ChatDeliveryStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export type DirectMessageEnvelope = {
  version: string;
  nonce: string;
  ciphertext: string;
  recipientId: string;
  senderPublicKey?: string;
};

export type CommunicationUser = {
  id: string;
  name: string;
  email?: string;
  role?: string;
  organizationId?: string;
  status?: string;
  avatar?: string;
  avatarUrl?: string | null;
  e2eePublicKey?: string;
  userStatus?: string;
  deletedAt?: string | null;
};

export type CommunicationMessage = {
  id: string;
  senderId: string;
  conversationId?: string;
  kind?: ChatMessageKind;
  text: string;
  textPreview?: string;
  audioUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  transcript?: string;
  durationSeconds?: number;
  mimeType?: string;
  e2eeEnvelope?: DirectMessageEnvelope | null;
  encrypted?: boolean;
  createdAt: string;
  sender?: CommunicationUser | null;
  status?: Exclude<ChatDeliveryStatus, 'sending'>;
};

export type CommunicationConversation = {
  id: string;
  title: string;
  kind: ConversationKind;
  channelMode: ConversationChannelMode;
  description?: string;
  encrypted?: boolean;
  participants: CommunicationUser[];
  lastMessage?: CommunicationMessage;
  unreadCount: number;
};

export type CommunicationContact = CommunicationUser & {
  directConversationId?: string | null;
  radioConversationId?: string | null;
};

export function isDirectCommunicationConversation(
  conversation: Pick<CommunicationConversation, 'kind' | 'channelMode' | 'participants'> | null | undefined
): boolean {
  return Boolean(
    conversation &&
      conversation.kind === 'direct' &&
      conversation.channelMode !== 'radio' &&
      conversation.participants.length === 2
  );
}

/**
 * Señala que un chat directo debe tratarse como cifrado. La validación
 * criptográfica exacta de la llave pertenece al adaptador de cada plataforma;
 * el contrato compartido permanece libre de dependencias y falla cerrado ante
 * cualquier llave anunciada por el peer.
 */
export function isDirectChatEncryptionActive(input: {
  currentUserId: string;
  conversation: Pick<CommunicationConversation, 'kind' | 'channelMode' | 'participants' | 'encrypted'> | null | undefined;
}): boolean {
  const conversation = input.conversation;
  if (!conversation || conversation.encrypted === false || !isDirectCommunicationConversation(conversation)) {
    return false;
  }
  const recipient = conversation.participants.find(
    (participant) => participant.id !== input.currentUserId
  );
  return Boolean(String(recipient?.e2eePublicKey || '').trim());
}

export function getPeerParticipant(
  conversation: Pick<CommunicationConversation, 'participants'> | null | undefined,
  currentUserId: string | null | undefined
): CommunicationUser | null {
  if (!conversation || !currentUserId) return null;
  return conversation.participants.find((participant) => participant.id !== currentUserId) || null;
}
