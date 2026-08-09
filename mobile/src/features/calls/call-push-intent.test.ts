import { parsePushCallIntent } from './call-push-intent';

describe('call push intent', () => {
  it('rehidrata una videollamada y conserva identidad y deadline autoritativos', () => {
    expect(parsePushCallIntent(
      'manecomb:///call?callId=call-1&conversationId=conv-1&callerId=user-1&callerName=Ana+L%C3%B3pez&mode=video&action=accept&expiresAt=2030-01-01T00%3A00%3A35.000Z&ringTimeoutMs=35000',
      () => Date.parse('2030-01-01T00:00:00.000Z')
    )).toEqual({
      key: 'call-1:accept',
      callId: 'call-1',
      conversationId: 'conv-1',
      callerId: 'user-1',
      callerName: 'Ana López',
      mode: 'video',
      action: 'accept',
      expiresAt: '2030-01-01T00:00:35.000Z',
      ringTimeoutMs: 35000,
    });
  });

  it('rechaza un deep link cuya llamada ya expiro', () => {
    const intent = parsePushCallIntent(
      'manecomb:///call?callId=old&conversationId=conv&callerId=user&expiresAt=2030-01-01T00%3A00%3A35.000Z&ringTimeoutMs=35000',
      () => Date.parse('2030-01-01T00:00:36.000Z')
    );
    expect(intent).toBeNull();
  });

  it('rechaza expiresAt corrupto en lugar de revivir una llamada dudosa', () => {
    expect(parsePushCallIntent(
      'manecomb:///call?callId=c&conversationId=v&callerId=u&expiresAt=not-a-date'
    )).toBeNull();
  });

  it('mantiene compatibilidad segura si un enlace legado no trae deadline', () => {
    const intent = parsePushCallIntent(
      'manecomb:///call?callId=c&conversationId=v&callerId=u&mode=screen&action=open'
    );
    expect(intent?.mode).toBe('audio');
    expect(intent?.action).toBe('incoming');
    expect(intent?.expiresAt).toBeNull();
    expect(intent?.ringTimeoutMs).toBeNull();
  });

  it('rechaza URLs incompletas o ajenas', () => {
    expect(parsePushCallIntent('manecomb:///chat?conversationId=conv')).toBeNull();
    expect(parsePushCallIntent('manecomb:///call?callId=c')).toBeNull();
    expect(parsePushCallIntent(null)).toBeNull();
  });
});
