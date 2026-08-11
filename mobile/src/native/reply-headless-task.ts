import { NativeModules } from 'react-native';
import * as SecureStore from '@/src/native/secure-store';
import {
  getConversationsRequest,
  getSessionRequest,
  sendMessageRequest,
  setAuthToken,
} from '@/src/api/client';
import {
  buildInlineReplyPayload,
  E2EE_INLINE_REPLY_KEY_PREFIX,
} from '@/src/native/notification-reply-payload';

const TOKEN_KEY = 'combis-session-token';

type ReplyTaskPayload = {
  conversationId?: string;
  text?: string;
  notificationId?: number;
};

type ManeCombNotificationModule = {
  updateReplyStatus: (notificationId: number, status: string) => Promise<boolean>;
};

const NativeNotification = NativeModules.ManeCombNotification as
  | ManeCombNotificationModule
  | undefined;

async function updateStatus(notificationId: number | undefined, status: string) {
  if (typeof notificationId !== 'number') {
    return;
  }

  await NativeNotification?.updateReplyStatus(notificationId, status).catch(() => false);
}

/**
 * Rebuilds the outgoing chat payload with the same E2EE authority used by the
 * hydrated app. The backend never receives plaintext merely because the reply
 * originated in Android RemoteInput.
 */
async function prepareReplyPayload(conversationId: string, text: string) {
  const [conversations, session] = await Promise.all([
    getConversationsRequest(),
    getSessionRequest(),
  ]);
  const conversation = conversations.find((entry) => entry.id === conversationId) || null;
  const currentUserId = String(session.profile.user.id || '').trim();

  if (!conversation || !currentUserId) {
    return { ok: false as const, status: 'Abre ManeComb para responder' };
  }

  // Keychain puede negar lectura mientras el dispositivo esta bloqueado. Se
  // trata como ausencia de llave y la politica pura de abajo falla cerrada solo
  // si ese hilo realmente requiere E2EE; los hilos no cifrados siguen pudiendo
  // responder sin depender de la llave local.
  const storedKeyPair = await SecureStore.getItemAsync(
    `${E2EE_INLINE_REPLY_KEY_PREFIX}${currentUserId}`
  ).catch(() => null);
  const result = buildInlineReplyPayload({
    text,
    currentUserId,
    conversation,
    storedKeyPair,
  });

  if (!result.ok) {
    return {
      ok: false as const,
      status: result.reason === 'e2ee_key_unavailable'
        ? 'Desbloquea y abre ManeComb para responder'
        : 'Abre ManeComb para responder',
    };
  }

  return { ok: true as const, payload: result.payload };
}

/**
 * Sends a reply from the native notification without depending on Zustand
 * hydration. Session credentials and E2EE material are read from secure local
 * storage and the message is posted through the canonical chat endpoint.
 */
export async function replyHeadlessTask(payload: ReplyTaskPayload) {
  const conversationId = String(payload?.conversationId || '').trim();
  const text = String(payload?.text || '').trim();

  if (!conversationId || !text) {
    return;
  }

  try {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);

    if (!token) {
      await updateStatus(payload.notificationId, 'Abre ManeComb para responder');
      return;
    }

    setAuthToken(token);

    const prepared = await prepareReplyPayload(conversationId, text);
    if (!prepared.ok) {
      await updateStatus(payload.notificationId, prepared.status);
      return;
    }

    await sendMessageRequest(conversationId, prepared.payload);
    await updateStatus(payload.notificationId, 'Enviado');
  } catch {
    await updateStatus(payload.notificationId, 'No se pudo enviar');
  }
}

export default replyHeadlessTask;
