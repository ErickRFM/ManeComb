import type { Socket } from 'socket.io-client';
import { getRadioRealtimeErrorMessage } from './radio-live-errors';

export type RadioLiveIdentity = {
  id: string;
  name: string;
};

export type RadioLiveFrame = {
  channelId: string;
  data: string;
  sequence: number;
  sentAt: number;
  transmissionId: string;
};

type RadioLiveHandlers = {
  onEnd: (payload: { channelId: string; reason?: string; transmissionId: string }) => void;
  onError: (message: string) => void;
  onFrame: (payload: RadioLiveFrame) => void;
  onStateChange: (state: RadioRealtimeConnectionState) => void;
  onStart: (payload: {
    channelId: string;
    startedAt: number;
    transmissionId: string;
    transmitter: RadioLiveIdentity;
  }) => void;
};

export type RadioRealtimeConnectionState =
  | 'connecting'
  | 'join_sent'
  | 'ready'
  | 'reconnecting'
  | 'offline'
  | 'unauthorized'
  | 'error';

type Ack = {
  channelId?: string;
  error?: string;
  historyRoom?: string;
  liveRoom?: string;
  ok: boolean;
  socketId?: string;
  transmissionId?: string;
  transmitter?: RadioLiveIdentity;
};

// Transporte Radio. Es propiedad exclusiva del runtime de radio-live: no lo
// instancia ninguna pantalla. La preempcion por llamada no se resuelve aqui con
// una bandera global, sino deteniendo el runtime (radio-live-store.pause).
export class RadioRealtimeService {
  private channelId: string | null = null;
  private handlers: RadioLiveHandlers;
  private socket: Socket | null = null;
  private joinGeneration = 0;

  constructor(handlers: RadioLiveHandlers) {
    this.handlers = handlers;
  }

  connect(socket: Socket | null, channelId: string) {
    if (this.socket === socket && this.channelId === channelId) return;
    const previousSocket = this.socket;
    const previousChannelId = this.channelId;
    this.joinGeneration += 1;
    if (previousSocket?.connected && previousChannelId) {
      previousSocket.emit('radio:leave', { channelId: previousChannelId });
    }
    if (this.socket !== socket) {
      this.detachSocket();
      this.socket = socket;
      if (socket) this.attachSocket(socket);
    }
    this.channelId = channelId;
    this.handlers.onStateChange('connecting');
    if (socket?.connected) {
      this.joinChannel().catch(() => undefined);
    }
  }

  async requestTransmission(): Promise<Ack> {
    const socket = this.socket;
    const channelId = this.channelId;
    const generation = this.joinGeneration;
    let ack = await this.emitWithAck('radio:start', { channelId }, socket);
    const stillCurrent = generation === this.joinGeneration && channelId === this.channelId && socket === this.socket;
    if (ack.error === 'radio_ack_timeout' && stillCurrent && socket?.connected) {
      ack = await this.emitWithAck('radio:start', { channelId }, socket);
    }
    const stale = generation !== this.joinGeneration || channelId !== this.channelId || socket !== this.socket;
    if (!stale) return ack;
    if (ack.ok && ack.transmissionId && channelId) {
      await this.emitWithAck('radio:end', { channelId, transmissionId: ack.transmissionId }, socket);
    }
    return { ok: false, error: 'radio_request_stale' };
  }

  sendFrame(payload: Omit<RadioLiveFrame, 'channelId'>) {
    if (!this.socket?.connected || !this.channelId || !payload.transmissionId ||
        payload.data.length !== 856 || !Number.isInteger(payload.sequence) || payload.sequence < 0 ||
        !Number.isFinite(payload.sentAt)) return false;
    this.socket.emit('radio:frame', { ...payload, channelId: this.channelId });
    return true;
  }

  async endTransmission(transmissionId: string) {
    const socket = this.socket;
    const channelId = this.channelId;
    const payload = { channelId, transmissionId };
    const first = await this.emitWithAck('radio:end', payload, socket);
    if (first.ok || first.error === 'transmission_not_active') return { ok: true };
    if (first.error !== 'radio_ack_timeout' || !socket?.connected) return first;
    const retry = await this.emitWithAck('radio:end', payload, socket);
    return retry.error === 'transmission_not_active' ? { ok: true } : retry;
  }

  disconnect() {
    if (this.socket?.connected && this.channelId) {
      this.socket.emit('radio:leave', { channelId: this.channelId });
    }
    this.detachSocket();
    this.socket = null;
    this.channelId = null;
    this.joinGeneration += 1;
  }

  private handleConnect = () => {
    this.joinChannel().catch(() => undefined);
  };

  private handleReconnectAttempt = () => {
    this.handlers.onStateChange('reconnecting');
  };

  private handleConnectError = (error: Error) => {
    const message = getRadioRealtimeErrorMessage(error.message);
    this.handlers.onStateChange(message === 'Sesion expirada' ? 'unauthorized' : 'reconnecting');
  };

  private handleDisconnect = () => {
    this.joinGeneration += 1;
    this.handlers.onStateChange('offline');
  };

  private handleStart = (payload: Parameters<RadioLiveHandlers['onStart']>[0]) => {
    if (payload.channelId === this.channelId) this.handlers.onStart(payload);
  };

  private handleFrame = (payload: RadioLiveFrame) => {
    if (payload.channelId === this.channelId) this.handlers.onFrame(payload);
  };

  private handleEnd = (payload: Parameters<RadioLiveHandlers['onEnd']>[0]) => {
    if (payload.channelId === this.channelId) this.handlers.onEnd(payload);
  };

  private handleError = (payload?: { message?: string }) => {
    this.handlers.onError(getRadioRealtimeErrorMessage(payload?.message));
  };

  private attachSocket(socket: Socket) {
    socket.on('connect', this.handleConnect);
    socket.io.on('reconnect_attempt', this.handleReconnectAttempt);
    socket.on('connect_error', this.handleConnectError);
    socket.on('disconnect', this.handleDisconnect);
    socket.on('radio:start', this.handleStart);
    socket.on('radio:frame', this.handleFrame);
    socket.on('radio:end', this.handleEnd);
    socket.on('radio:error', this.handleError);
  }

  private detachSocket() {
    const socket = this.socket;
    if (!socket) return;
    socket.off('connect', this.handleConnect);
    socket.io.off('reconnect_attempt', this.handleReconnectAttempt);
    socket.off('connect_error', this.handleConnectError);
    socket.off('disconnect', this.handleDisconnect);
    socket.off('radio:start', this.handleStart);
    socket.off('radio:frame', this.handleFrame);
    socket.off('radio:end', this.handleEnd);
    socket.off('radio:error', this.handleError);
  }

  private async joinChannel() {
    if (!this.socket?.connected || !this.channelId) return;
    const generation = ++this.joinGeneration;
    const channelId = this.channelId;
    this.handlers.onStateChange('join_sent');
    let ack = await this.emitWithAck('radio:join', { channelId });
    const stillCurrent = generation === this.joinGeneration && channelId === this.channelId;
    if (ack.error === 'radio_ack_timeout' && stillCurrent && this.socket?.connected) {
      ack = await this.emitWithAck('radio:join', { channelId });
    }
    if (generation !== this.joinGeneration || channelId !== this.channelId) return;
    if (ack.ok) {
      this.handlers.onStateChange('ready');
      return;
    }
    const unauthorized = ack.error === 'forbidden' || ack.error === 'unauthorized';
    this.handlers.onStateChange(unauthorized ? 'unauthorized' : 'error');
  }

  private emitWithAck(
    event: string,
    payload: Record<string, unknown>,
    socket: Socket | null = this.socket
  ): Promise<Ack> {
    return new Promise((resolve) => {
      if (!socket?.connected) {
        resolve({ ok: false, error: 'radio_disconnected' });
        return;
      }
      socket.timeout(5000).emit(event, payload, (error: unknown, ack?: Ack) => {
        resolve(error ? { ok: false, error: 'radio_ack_timeout' } : ack || { ok: false });
      });
    });
  }
}
