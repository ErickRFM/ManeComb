import { parsePushCallIntent } from './call-push-intent';

describe('call push intent', () => {
  it('rehidrata una videollamada y conserva identidad autoritativa', () => {
    expect(parsePushCallIntent(
      'manecomb:///call?callId=call-1&conversationId=conv-1&callerId=user-1&callerName=Ana+L%C3%B3pez&mode=video&action=accept'
    )).toEqual({
      key: 'call-1:accept',
      callId: 'call-1',
      conversationId: 'conv-1',
      callerId: 'user-1',
      callerName: 'Ana López',
      mode: 'video',
      action: 'accept',
    });
  });

  it('degrada modo y accion desconocidos de forma segura', () => {
    const intent = parsePushCallIntent(
      'manecomb:///call?callId=c&conversationId=v&callerId=u&mode=screen&action=open'
    );
    expect(intent?.mode).toBe('audio');
    expect(intent?.action).toBe('incoming');
  });

  it('rechaza URLs incompletas o ajenas', () => {
    expect(parsePushCallIntent('manecomb:///chat?conversationId=conv')).toBeNull();
    expect(parsePushCallIntent('manecomb:///call?callId=c')).toBeNull();
    expect(parsePushCallIntent(null)).toBeNull();
  });
});
