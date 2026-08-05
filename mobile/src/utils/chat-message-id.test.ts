import { createClientMessageId, normalizeClientMessageId } from './chat-message-id';

describe('chat-message-id', () => {
  it('crea identidades validas y distintas', () => {
    const first = createClientMessageId();
    const second = createClientMessageId();
    expect(normalizeClientMessageId(first)).toBe(first);
    expect(first).not.toBe(second);
  });

  it('rechaza identidades inseguras', () => {
    expect(normalizeClientMessageId('x')).toBe('');
    expect(normalizeClientMessageId('mensaje con espacios')).toBe('');
  });
});
