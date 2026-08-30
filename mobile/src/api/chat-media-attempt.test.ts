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

class ReactNativeFormDataFixture {
  _parts: Array<[string, any]> = [];

  append(name: string, value: any) {
    this._parts.push([name, value]);
  }

  value(name: string) {
    for (let index = this._parts.length - 1; index >= 0; index -= 1) {
      if (this._parts[index][0] === name) return this._parts[index][1];
    }
    return null;
  }
}

function voiceForm(options: { caption?: string; fileName?: string } = {}) {
  const form = new ReactNativeFormDataFixture();
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

  it('lee el FormData de React Native y conserva el mismo ID al reconstruirlo', async () => {
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
    expect((replayForm as unknown as ReactNativeFormDataFixture).value('clientMessageId'))
      .toBe(first.clientMessageId);
    expect(buildChatMediaAttemptSignature({ conversationId: 'conversation-1', formData: firstForm, kind: 'audio' }))
      .toBe(buildChatMediaAttemptSignature({ conversationId: 'conversation-1', formData: replayForm, kind: 'audio' }));
  });

  it('reutiliza el ID ya adjunto al mismo FormData durante retry HTTP', async () => {
    const form = voiceForm();
    const first = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: form,
      kind: 'audio',
    });
    const retry = await ensureChatMediaAttemptIdentity({
      conversationId: 'conversation-1',
      formData: form,
      kind: 'audio',
    });
    expect(retry.clientMessageId).toBe(first.clientMessageId);
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
