import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildChatMediaAttemptSignature,
  clearChatMediaAttemptStateForTests,
  confirmChatMediaAttempt,
  ensureChatMediaAttemptIdentity,
} from './chat-media-attempt';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

class TestFormData {
  private values = new Map<string, any>();

  append(name: string, value: any) {
    this.values.set(name, value);
  }

  get(name: string) {
    return this.values.get(name) ?? null;
  }
}

function voiceForm(options: { caption?: string; fileName?: string } = {}) {
  const form = new TestFormData();
  form.append('durationSeconds', '12');
  form.append('caption', options.caption || 'Base 12');
  form.append('file', {
    uri: 'file:///data/user/0/manecomb/cache/voice-123.m4a',
    name: options.fileName || 'voice-original.m4a',
    type: 'audio/mp4',
  });
  return form as unknown as FormData;
}

describe('identidad durable de multimedia de Chat', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearChatMediaAttemptStateForTests();
  });

  it('reutiliza el mismo clientMessageId al reconstruir el FormData tras un corte de red', async () => {
    const firstForm = voiceForm({ fileName: 'voice-original.m4a' });
    const first = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: firstForm,
      kind: 'audio',
    });

    const replayForm = voiceForm({ fileName: 'voice-note-rebuilt.m4a' });
    const replay = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: replayForm,
      kind: 'audio',
    });

    expect(replay.clientMessageId).toBe(first.clientMessageId);
    expect((replayForm as any).get('clientMessageId')).toBe(first.clientMessageId);
    expect(buildChatMediaAttemptSignature({ conversationId: 'conversation-1', formData: firstForm, kind: 'audio' }))
      .toBe(buildChatMediaAttemptSignature({ conversationId: 'conversation-1', formData: replayForm, kind: 'audio' }));
  });

  it('libera la identidad solo cuando el servidor confirmó el intento', async () => {
    const firstForm = voiceForm();
    const first = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: firstForm,
      kind: 'audio',
    });

    await confirmChatMediaAttempt(first.signature, first.clientMessageId);

    const next = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: voiceForm(),
      kind: 'audio',
    });
    expect(next.clientMessageId).not.toBe(first.clientMessageId);
  });

  it('no colapsa dos intentos con contenido lógico diferente', async () => {
    const first = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: voiceForm({ caption: 'Uno' }),
      kind: 'audio',
    });
    const second = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: voiceForm({ caption: 'Dos' }),
      kind: 'audio',
    });
    expect(second.clientMessageId).not.toBe(first.clientMessageId);
  });
});
