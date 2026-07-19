import { NativeModules } from 'react-native';
import * as SecureStore from '@/src/native/secure-store';
import {
  getConversationsRequest,
  getSessionRequest,
  sendMessageRequest,
  setAuthToken,
} from '@/src/api/client';
import { isDirectChatEncryptionActive } from '@/src/utils/chat-e2ee';

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
 * Segunda barrera de cifrado, independiente del boton.
 *
 * La notificacion de un hilo cifrado ya no ofrece "Responder", pero una notificacion vieja
 * en cola, un payload remoto sin el flag, o un cambio futuro podrian llegar hasta aqui.
 * Este chequeo falla cerrado: ante cualquier duda (error de red, conversacion desconocida,
 * sesion no resoluble) no se envia, porque enviar significaria texto plano en un hilo cifrado.
 */
async function isEncryptedThread(conversationId: string) {
  try {
    const [conversations, session] = await Promise.all([
      getConversationsRequest(),
      getSessionRequest(),
    ]);
    const conversation = conversations.find((entry) => entry.id === conversationId) || null;

    if (!conversation) {
      return true;
    }

    return isDirectChatEncryptionActive({
      currentUserId: session.profile.user.id,
      conversation,
    });
  } catch {
    return true;
  }
}

/**
 * Envia una respuesta escrita desde la notificacion nativa sin depender de que el store
 * de Zustand este hidratado: rehidrata el token de sesion directo del storage seguro.
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
      await updateStatus(payload.notificationId, 'Abre la app para responder');
      return;
    }

    setAuthToken(token);

    if (await isEncryptedThread(conversationId)) {
      await updateStatus(payload.notificationId, 'Chat cifrado: abre la app para responder');
      return;
    }

    await sendMessageRequest(conversationId, { text });
    await updateStatus(payload.notificationId, 'Enviado');
  } catch {
    await updateStatus(payload.notificationId, 'No se pudo enviar');
  }
}

export default replyHeadlessTask;
