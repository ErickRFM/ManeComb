import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from '@/src/config/api_config';
import { getRadioRealtimeErrorMessage } from './radio-audio-service';

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
  onBusy: (payload: { channelId: string; transmitter?: RadioLiveIdentity }) => void;
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
  | 'idle'
  | 'connecting'
  | 'join_sent'
  | 'ready'
  | 'reconnecting'
  | 'unauthorized'
  | 'error';

type Ack = {
  error?: string;
  ok: boolean;
  transmissionId?: string;
  transmitter?: RadioLiveIdentity;
};

export class RadioRealtimeService {
  private channelId: string | null = null;
  private handlers: RadioLiveHandlers;
  private socket: Socket | null = null;
  private token: string | null = null;
  private joinGeneration = 0;

  constructor(handlers: RadioLiveHandlers) {
    this.handlers = handlers;
  }

  connect(token: string, channelId: string) {
    const sessionChanged = this.token !== token;
    this.token = token;
    this.channelId = channelId;

    if (sessionChanged) this.disconnect();
    if (!this.socket) this.socket = this.createSocket(token);

    if (this.socket.connected) {
      this.joinChannel().catch(() => undefined);
      return;
    }
    this.handlers.onStateChange('connecting');
    this.socket.connect();
  }

  setChannel(channelId: string) {
    if (this.channelId === channelId) return;
    if (this.channelId && this.socket?.connected) {
      this.socket.emit('radio:leave', { channelId: this.channelId });
    }
    this.channelId = channelId;
    this.joinChannel().catch(() => undefined);
  }

  async requestTransmission(): Promise<Ack> {
    return this.emitWithAck('radio:start', { channelId: this.channelId });
  }

  sendFrame(payload: Omit<RadioLiveFrame, 'channelId'>) {
    if (!this.socket?.connected || !this.channelId) return false;
    this.socket.emit('radio:frame', { ...payload, channelId: this.channelId });
    return true;
  }

  async endTransmission(transmissionId: string) {
    return this.emitWithAck('radio:end', { channelId: this.channelId, transmissionId });
  }

  disconnect() {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.joinGeneration += 1;
  }

  private createSocket(token: string) {
    const socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      transports: ['websocket'],
    });

    socket.on('connect', async () => {
      await this.joinChannel();
    });
    socket.io.on('reconnect_attempt', () => this.handlers.onStateChange('reconnecting'));
    socket.on('connect_error', (error) => {
      const message = getRadioRealtimeErrorMessage(error.message);
      this.handlers.onStateChange(message === 'Sesion expirada' ? 'unauthorized' : 'reconnecting');
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        this.handlers.onStateChange('idle');
        return;
      }
      this.handlers.onStateChange('reconnecting');
    });
    socket.on('radio:busy', this.handlers.onBusy);
    socket.on('radio:start', this.handlers.onStart);
    socket.on('radio:frame', this.handlers.onFrame);
    socket.on('radio:end', this.handlers.onEnd);
    socket.on('radio:error', (payload?: { message?: string }) =>
      this.handlers.onError(getRadioRealtimeErrorMessage(payload?.message))
    );
    return socket;
  }

  private async joinChannel() {
    if (!this.socket?.connected || !this.channelId) return;
    const generation = ++this.joinGeneration;
    const channelId = this.channelId;
    this.handlers.onStateChange('join_sent');
    this.socket.emit('conversation:join', channelId);
    const ack = await this.emitWithAck('radio:join', { channelId });
    if (generation !== this.joinGeneration || channelId !== this.channelId) return;
    if (ack.ok) {
      this.handlers.onStateChange('ready');
      return;
    }
    const unauthorized = ack.error === 'forbidden' || ack.error === 'unauthorized';
    this.handlers.onStateChange(unauthorized ? 'unauthorized' : 'error');
  }

  private emitWithAck(event: string, payload: Record<string, unknown>): Promise<Ack> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve({ ok: false, error: 'radio_disconnected' });
        return;
      }
      this.socket.timeout(5000).emit(event, payload, (error: unknown, ack?: Ack) => {
        resolve(error ? { ok: false, error: 'radio_ack_timeout' } : ack || { ok: false });
      });
    });
  }
}
