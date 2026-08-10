import type { CallMode } from './call-types';

export type PushCallIntent = {
  key: string;
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string | null;
  mode: CallMode;
  action: 'incoming' | 'accept' | 'dismiss';
  expiresAt: string | null;
  ringTimeoutMs: number | null;
  reason?: string | null;
};

function parseQuery(raw: string): Record<string, string> {
  const query = raw.split('?')[1] || '';
  return Object.fromEntries(
    query
      .split('&')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        const key = separator >= 0 ? entry.slice(0, separator) : entry;
        const value = separator >= 0 ? entry.slice(separator + 1) : '';
        return [decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, ' '))];
      })
  );
}

export function parsePushCallIntent(
  url: string | null | undefined,
  now: () => number = Date.now
): PushCallIntent | null {
  const safeUrl = String(url || '').trim();
  if (!safeUrl || !safeUrl.toLowerCase().includes('/call')) return null;
  const params = parseQuery(safeUrl);
  const callId = String(params.callId || '').trim();
  if (!callId) return null;

  if (params.action === 'dismiss') {
    return {
      key: `${callId}:dismiss`,
      callId,
      conversationId: '',
      callerId: '',
      callerName: null,
      mode: 'audio',
      action: 'dismiss',
      expiresAt: null,
      ringTimeoutMs: null,
      reason: String(params.reason || '').trim() || null,
    };
  }

  const conversationId = String(params.conversationId || '').trim();
  const callerId = String(params.callerId || '').trim();
  if (!conversationId || !callerId) return null;

  const expiresAt = String(params.expiresAt || '').trim() || null;
  if (expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= now()) return null;
  }

  const rawRingTimeoutMs = Number(params.ringTimeoutMs);
  const ringTimeoutMs = Number.isFinite(rawRingTimeoutMs) && rawRingTimeoutMs > 0
    ? Math.floor(rawRingTimeoutMs)
    : null;
  const action = params.action === 'accept' ? 'accept' : 'incoming';
  const mode: CallMode = params.mode === 'video' ? 'video' : 'audio';

  return {
    key: `${callId}:${action}`,
    callId,
    conversationId,
    callerId,
    callerName: String(params.callerName || '').trim() || null,
    mode,
    action,
    expiresAt,
    ringTimeoutMs,
  };
}
