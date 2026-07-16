import type { ChatDirectoryContact, ChatMessage, ConversationSummary } from '@/src/types/app';
import { formatClockDurationFromSeconds, formatRole } from '@/src/utils/format';
import type { MessageDeliveryStatus, MessageListItem } from '../types';

export const formatDuration = formatClockDurationFromSeconds;

export function getConversationContact(conversation: ConversationSummary, currentUserId?: string | null) {
  const others = conversation.participants.filter((participant) => participant.id !== currentUserId);
  const preferredDriver = others.find((participant) => participant.role === 'driver');

  return preferredDriver || others[0] || conversation.participants[0] || null;
}

export function getConversationIconName(conversation: ConversationSummary) {
  return conversation.kind === 'group' ? 'bullhorn-outline' : 'message-text-outline';
}

export function getConversationDisplayTitle(conversation: ConversationSummary) {
  if (conversation.kind === 'group' && /general/i.test(conversation.title)) {
    return 'General Operativo';
  }

  return conversation.title;
}

export function getConversationPresenceLabel(conversation: ConversationSummary, activeContact?: { status?: string } | null) {
  if (conversation.kind !== 'direct') {
    return 'Canal operativo';
  }

  const normalizedStatus = String(activeContact?.status || '').trim().toLowerCase();
  return /available|disponible|online|linea|activo/.test(normalizedStatus)
    ? 'En linea'
    : 'Offline';
}

export function getConversationSubline(conversation: ConversationSummary, activeContact?: ChatDirectoryContact | null) {
  if (conversation.kind === 'group') {
    return `${conversation.participants.length || 1} integrantes`;
  }

  if (!activeContact) {
    return 'Chat directo';
  }

  const unitLabel =
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).unit ||
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicle ||
    (activeContact as ChatDirectoryContact & { unit?: string; vehicle?: string; vehicleName?: string }).vehicleName;

  return unitLabel || formatRole(activeContact.role);
}

export function getConversationPreview(conversation: ConversationSummary) {
  if (!conversation.lastMessage) {
    return 'Sin mensajes recientes.';
  }

  return conversation.lastMessage.textPreview || conversation.lastMessage.text || 'Actualizacion protegida';
}

export function getConversationLastActivityTime(conversation: ConversationSummary) {
  const lastTimestamp = conversation.lastMessage?.createdAt;

  if (!lastTimestamp) {
    return 0;
  }

  const parsedDate = new Date(lastTimestamp).getTime();
  return Number.isFinite(parsedDate) ? parsedDate : 0;
}

export function getContactSearchText(contact: ChatDirectoryContact) {
  return `${contact.name} ${contact.email} ${contact.phone} ${contact.role}`.toLowerCase();
}

export function isPriorityConversation(conversation: ConversationSummary) {
  const text = `${conversation.title} ${conversation.description || ''} ${getConversationPreview(conversation)}`.toLowerCase();

  return (
    conversation.unreadCount > 0 ||
    text.includes('sos') ||
    text.includes('urgente') ||
    text.includes('retraso') ||
    text.includes('incidente') ||
    text.includes('alerta')
  );
}

export function getOperationalStatusRank(status?: string | null) {
  const normalizedStatus = `${status || ''}`.toLowerCase();

  if (/available|disponible|online|linea|activo/.test(normalizedStatus)) return 0;
  if (/route|ruta|en camino|busy|ocupado/.test(normalizedStatus)) return 1;
  if (/transmit|transmitiendo|radio|ptt/.test(normalizedStatus)) return 2;
  if (/offline|desconect|inactive|inactivo/.test(normalizedStatus)) return 3;
  return 4;
}

export function getOperationalStatusTone(status?: string | null) {
  const rank = getOperationalStatusRank(status);

  if (rank === 0) return 'positive';
  if (rank === 1) return 'warning';
  if (rank === 2) return 'danger';
  if (rank === 3) return 'neutral';
  return 'info';
}

export function isSystemMessage(message: ChatMessage) {
  const body = `${message.text || ''} ${message.textPreview || ''}`.toLowerCase();
  return /ruta asignada|ruta finalizada|incidente|fuera de ruta|destino|gps perdido|conductor cambiado|cambio de estado/.test(body);
}

export function getMessageDayKey(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return 'sin-fecha';
  }

  return date.toISOString().slice(0, 10);
}

export function formatMessageDateLabel(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return 'Sin fecha';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const key = getMessageDayKey(createdAt);

  if (key === getMessageDayKey(today.toISOString())) {
    return 'Hoy';
  }

  if (key === getMessageDayKey(yesterday.toISOString())) {
    return 'Ayer';
  }

  return date.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatMessageTime(createdAt: string) {
  const date = new Date(createdAt);

  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function buildMessageList(messages: ChatMessage[]): MessageListItem[] {
  const items: MessageListItem[] = [];
  let lastDayKey: string | null = null;

  messages.forEach((message) => {
    const dayKey = getMessageDayKey(message.createdAt);

    if (dayKey !== lastDayKey) {
      items.push({
        type: 'date',
        id: `date-${dayKey}`,
        label: formatMessageDateLabel(message.createdAt),
      });
      lastDayKey = dayKey;
    }

    items.push({
      type: 'message',
      id: message.id,
      message,
    });
  });

  return items;
}

export function getMessageDeliveryStatus(message: ChatMessage, isOwn: boolean): MessageDeliveryStatus | null {
  if (!isOwn) {
    return null;
  }

  const status = (message as ChatMessage & {
    status?: MessageDeliveryStatus;
    deliveryStatus?: MessageDeliveryStatus;
    sendStatus?: MessageDeliveryStatus;
  }).status || (message as ChatMessage & {
    deliveryStatus?: MessageDeliveryStatus;
  }).deliveryStatus || (message as ChatMessage & {
    sendStatus?: MessageDeliveryStatus;
  }).sendStatus || (message as ChatMessage & {
    localStatus?: MessageDeliveryStatus;
  }).localStatus;

  if (
    status === 'sending' ||
    status === 'sent' ||
    status === 'delivered' ||
    status === 'read' ||
    status === 'failed'
  ) {
    return status;
  }

  return 'sent';
}
