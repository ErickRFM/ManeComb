export function createClientMessageId(): string {
  if (typeof globalThis !== 'undefined' && typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeClientMessageId(value: unknown): string {
  const normalized = String(value || '').trim();
  return /^[A-Za-z0-9:_-]{8,128}$/.test(normalized) ? normalized : '';
}
