import { io, type Socket } from 'socket.io-client';

import { SOCKET_URL } from '@/src/api/client';
import * as SecureStore from '@/src/native/secure-store';

const TOKEN_KEY = 'combis-session-token';
const ACTION_TIMEOUT_MS = 12_000;

type CallActionPayload = {
  callId?: string;
  action?: 'reject' | string;
};

type Dependencies = {
  getToken?: () => Promise<string | null>;
  createSocket?: (token: string) => Socket;
  timeoutMs?: number;
};

export async function runCallNotificationAction(
  payload: CallActionPayload,
  dependencies: Dependencies = {}
): Promise<{ ok: boolean; code?: string }> {
  const callId = String(payload?.callId || '').trim();
  const action = String(payload?.action || '').trim();
  if (!callId || action !== 'reject') return { ok: false, code: 'invalid_action' };

  const token = await (dependencies.getToken || (() => SecureStore.getItemAsync(TOKEN_KEY)))();
  if (!token) return { ok: false, code: 'no_session' };

  const socket = (dependencies.createSocket || ((authToken: string) =>
    io(SOCKET_URL, {
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: false,
      forceNew: true,
      timeout: 8000,
    })))(token);
  const timeoutMs = dependencies.timeoutMs || ACTION_TIMEOUT_MS;

  try {
    return await new Promise((resolve) => {
      let settled = false;
      const finish = (result: { ok: boolean; code?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };
      const timer = setTimeout(() => finish({ ok: false, code: 'timeout' }), timeoutMs);

      socket.once('connect_error', () => finish({ ok: false, code: 'connect_error' }));
      socket.once('connect', () => {
        socket.emit('rtc:reject', { callId }, (ack: { ok?: boolean; code?: string } | undefined) => {
          finish(ack?.ok ? { ok: true } : { ok: false, code: ack?.code || 'reject_failed' });
        });
      });
    });
  } finally {
    socket.disconnect();
  }
}

export async function callNotificationActionHeadlessTask(payload: CallActionPayload) {
  await runCallNotificationAction(payload).catch(() => undefined);
}

export default callNotificationActionHeadlessTask;
