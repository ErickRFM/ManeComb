import { NativeModules } from 'react-native';
import * as SecureStore from '@/src/native/secure-store';
import { sendMessageRequest, setAuthToken } from '@/src/api/client';

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
      await updateStatus(payload.notificationId, 'Inicia sesion para responder');
      return;
    }

    setAuthToken(token);
    await sendMessageRequest(conversationId, { text });
    await updateStatus(payload.notificationId, 'Enviado');
  } catch {
    await updateStatus(payload.notificationId, 'No se pudo enviar');
  }
}

export default replyHeadlessTask;
