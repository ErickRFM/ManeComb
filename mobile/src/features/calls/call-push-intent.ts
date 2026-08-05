import type { CallMode } from './call-types';

export type PushCallIntent = {
  key: string;
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string | null;
  mode: CallMode;
  action: 'incoming' | 'accept';
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

export function parsePushCallIntent(url: string | null | undefined): PushCallIntent | null {
  const safeUrl = String(url || '').trim();
  if (!safeUrl || !safeUrl.toLowerCase().includes('/call')) return null;
  const params = parseQuery(safeUrl);
  const callId = String(params.callId || '').trim();
  const conversationId = String(params.conversationId || '').trim();
  const callerId = String(params.callerId || '').trim();
  if (!callId || !conversationId || !callerId) return null;
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
  };
}
