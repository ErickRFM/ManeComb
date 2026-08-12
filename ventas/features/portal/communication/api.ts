import type {
  CommunicationContact,
  CommunicationConversation,
  CommunicationMessage,
  DirectMessageEnvelope,
} from '@shared/communication';
import { API_ORIGIN, apiClient } from '@/src/lib/api';

export type CommunicationMessagePageInfo = {
  hasMore?: boolean;
  nextCursor?: string | null;
};

async function unwrapData<T>(request: Promise<{ data: { data?: T; pageInfo?: CommunicationMessagePageInfo } | T }>) {
  const response = await request;
  const payload = response.data as { data?: T; pageInfo?: CommunicationMessagePageInfo } | T;
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return {
      data: (payload as { data: T }).data,
      pageInfo: (payload as { pageInfo?: CommunicationMessagePageInfo }).pageInfo,
    };
  }
  return { data: payload as T, pageInfo: undefined };
}

export async function getCommunicationConversations() {
  return (await unwrapData<CommunicationConversation[]>(apiClient.get('/chat/conversations'))).data;
}

export async function getCommunicationContacts() {
  return (await unwrapData<CommunicationContact[]>(apiClient.get('/chat/contacts'))).data;
}

export async function openCommunicationDirectConversation(targetUserId: string) {
  return (
    await unwrapData<CommunicationConversation>(
      apiClient.post('/chat/conversations/direct', {
        targetUserId,
        channelMode: 'chat',
      })
    )
  ).data;
}

export async function getCommunicationMessages(
  conversationId: string,
  options: { before?: string | null; limit?: number } = {}
) {
  return await unwrapData<CommunicationMessage[]>(
    apiClient.get(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, {
      params: {
        limit: Math.max(1, Math.min(100, Number(options.limit) || 50)),
        ...(options.before ? { before: options.before } : {}),
      },
    })
  );
}

export async function sendCommunicationTextMessage(
  conversationId: string,
  payload: {
    text?: string;
    textPreview?: string;
    clientMessageId: string;
    e2eeEnvelope?: DirectMessageEnvelope | null;
  }
) {
  return (
    await unwrapData<CommunicationMessage>(
      apiClient.post(`/chat/conversations/${encodeURIComponent(conversationId)}/messages`, payload)
    )
  ).data;
}

export async function sendCommunicationVoiceMessage(
  conversationId: string,
  file: Blob,
  durationSeconds: number,
  caption = ''
) {
  const formData = new FormData();
  formData.append('file', file, `voice-${Date.now()}.webm`);
  formData.append('durationSeconds', String(Math.max(1, Math.round(durationSeconds))));
  if (caption.trim()) formData.append('caption', caption.trim());

  return (
    await unwrapData<CommunicationMessage>(
      apiClient.post(`/chat/conversations/${encodeURIComponent(conversationId)}/audio`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    )
  ).data;
}

export async function sendCommunicationMediaMessage(
  conversationId: string,
  file: File,
  caption = ''
) {
  const formData = new FormData();
  formData.append('file', file, file.name || `media-${Date.now()}`);
  if (caption.trim()) formData.append('caption', caption.trim());

  return (
    await unwrapData<CommunicationMessage>(
      apiClient.post(`/chat/conversations/${encodeURIComponent(conversationId)}/media`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    )
  ).data;
}

export type PortalRtcIceConfig = {
  iceServers: RTCIceServer[];
  turnEnabled?: boolean;
};

export async function getPortalRtcIceConfig() {
  return (await unwrapData<PortalRtcIceConfig>(apiClient.get('/rtc/config'))).data;
}

export type PortalE2eeBackupRecord = {
  deviceId: string;
  publicKey: string;
  backupCipher: string;
  backupVersion: string;
  platform: string;
  label?: string;
  updatedAt?: string;
  restoredAt?: string | null;
};

export async function getPortalE2eeBackup(deviceId?: string) {
  return (
    await unwrapData<PortalE2eeBackupRecord | null>(
      apiClient.get('/auth/e2ee-backup', {
        params: deviceId ? { deviceId } : undefined,
      })
    )
  ).data;
}

export async function putPortalE2eeBackup(payload: {
  deviceId: string;
  publicKey: string;
  backupCipher: string;
  backupVersion: string;
  platform: string;
  label?: string;
  restoredAt?: string;
}) {
  return (await unwrapData<PortalE2eeBackupRecord>(apiClient.put('/auth/e2ee-backup', payload))).data;
}

export async function setPortalE2eePublicKey(publicKey: string) {
  return (
    await unwrapData<Record<string, unknown>>(
      apiClient.patch('/users/me', {
        e2eePublicKey: publicKey,
        e2eeKeyRotatedAt: new Date().toISOString(),
      })
    )
  ).data;
}

/**
 * Los assets de Chat son privados. Un <img src> o <video src> no puede adjuntar
 * el Bearer token, por lo que el Portal los descarga con el cliente autenticado
 * y entrega a la UI un object URL local revocable.
 */
export async function loadAuthenticatedCommunicationAsset(sourceUrl: string) {
  const parsed = new URL(String(sourceUrl || ''), API_ORIGIN);
  const apiOrigin = new URL(API_ORIGIN).origin;
  if (parsed.origin !== apiOrigin) {
    throw new Error('El archivo de comunicación apunta a un origen no autorizado.');
  }
  const response = await apiClient.get<Blob>(parsed.toString(), { responseType: 'blob' });
  return URL.createObjectURL(response.data);
}
