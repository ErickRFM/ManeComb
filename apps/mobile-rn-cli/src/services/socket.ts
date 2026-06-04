import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL, isDevelopmentEnv } from '../config/env';

let socket: Socket | null = null;

export function connectSocket(token: string) {
  if (socket?.connected) {
    return socket;
  }

  socket?.disconnect();
  socket = io(SOCKET_URL, {
    transports: ['websocket'],
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  if (isDevelopmentEnv) {
    socket.on('connect', () => console.log('[ManeCombRN:socket] conectado'));
    socket.on('disconnect', (reason) => console.log('[ManeCombRN:socket] desconectado', reason));
    socket.io.on('reconnect_attempt', () => console.log('[ManeCombRN:socket] reintentando'));
  }

  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
