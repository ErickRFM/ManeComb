import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { getTextInputProps } from '@/src/utils/text-input-props';
import { MAX_VOICE_NOTE_SECONDS } from '../types';
import { formatDuration } from '../utils/conversation';
import type { useChatController } from '../hooks/use-chat-controller';

type ChatComposerProps = Pick<
  ReturnType<typeof useChatController>,
  | 'activeConversation'
  | 'attachmentNotice'
  | 'canRecord'
  | 'canRetryVoiceNote'
  | 'canSendText'
  | 'composerPlaceholder'
  | 'draft'
  | 'emitTyping'
  | 'handleSendText'
  | 'handleVoiceAction'
  | 'isNearMessagesBottomRef'
  | 'isSubmitting'
  | 'recordingSeconds'
  | 'recordingState'
  | 'recorderMessage'
  | 'retryVoiceNote'
  | 'scrollMessagesToEnd'
  | 'setAttachmentMenuOpen'
  | 'setDraft'
  | 'styles'
  | 'theme'
>;

export function ChatComposer({
  activeConversation,
  attachmentNotice,
  canRecord,
  canRetryVoiceNote,
  canSendText,
  composerPlaceholder,
  draft,
  emitTyping,
  handleSendText,
  handleVoiceAction,
  isNearMessagesBottomRef,
  isSubmitting,
  recordingSeconds,
  recordingState,
  recorderMessage,
  retryVoiceNote,
  scrollMessagesToEnd,
  setAttachmentMenuOpen,
  setDraft,
  styles,
  theme,
}: ChatComposerProps) {
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChangeText = (text: string) => {
    setDraft(text);
    if (!emitTyping || !activeConversation) return;
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    } else {
      emitTyping(activeConversation.id, true);
    }
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
      emitTyping(activeConversation.id, false);
    }, 2000);
  };

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (emitTyping && activeConversation) {
      emitTyping(activeConversation.id, false);
    }
  }, [activeConversation, emitTyping]);

  return (
    <View style={styles.composerShell}>
      {recorderMessage ? (
        <View style={styles.recorderHint}>
          <MaterialCommunityIcons
            name={
              recordingState === 'recording'
                ? 'record-rec'
                : canRetryVoiceNote
                  ? 'alert-circle-outline'
                  : 'information-outline'
            }
            size={16}
            color={
              recordingState === 'recording'
                ? theme.colors.accent
                : canRetryVoiceNote
                  ? theme.colors.warning
                  : theme.colors.info
            }
          />
          <Text style={styles.recorderHintText}>
            {recordingState === 'recording'
              ? `${recorderMessage} ${formatDuration(recordingSeconds)} / ${formatDuration(MAX_VOICE_NOTE_SECONDS)}`
              : recorderMessage}
          </Text>
          {canRetryVoiceNote && recordingState !== 'uploading' ? (
            <Pressable
              accessibilityLabel="Reintentar envio de la nota de voz"
              accessibilityRole="button"
              onPress={retryVoiceNote}>
              <Text style={[styles.recorderHintText, { color: theme.colors.info }]}>
                Reintentar
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {attachmentNotice ? (
        <View style={styles.recorderHint}>
          <MaterialCommunityIcons name="paperclip" size={16} color={theme.colors.info} />
          <Text style={styles.recorderHintText}>{attachmentNotice}</Text>
        </View>
      ) : null}

      <View style={styles.composerBar}>
        <Pressable
          accessibilityLabel="Abrir adjuntos"
          accessibilityRole="button"
          onPress={() => {
            setAttachmentMenuOpen(true);
          }}
          style={({ pressed }) => [styles.attachButton, pressed ? styles.controlPressed : undefined]}>
          <MaterialCommunityIcons name="plus" size={24} color={theme.colors.text} />
        </Pressable>

        <View style={styles.composerInputShell}>
          <TextInput
            {...getTextInputProps(theme, {
              autoComplete: 'off',
              returnKeyType: 'send',
              submitBehavior: 'newline',
            })}
            value={draft}
            onChangeText={handleChangeText}
            placeholder={composerPlaceholder}
            placeholderTextColor={theme.colors.muted}
            style={styles.composerInput}
            onFocus={() => {
              if (isNearMessagesBottomRef.current) {
                scrollMessagesToEnd(false);
              }
            }}
            onSubmitEditing={handleSendText}
            multiline
          />
        </View>

        {draft.trim().length ? (
          <Pressable
            accessibilityLabel="Enviar mensaje"
            accessibilityRole="button"
            onPress={() => { handleSendText(); }}
            disabled={!canSendText}
            style={({ pressed }) => [
              styles.sendIconButton,
              pressed && canSendText ? styles.controlPressed : undefined,
              !canSendText ? styles.voiceButtonDisabled : undefined,
            ]}>
            {isSubmitting && recordingState !== 'uploading' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons name="send" size={20} color="#FFFFFF" />
            )}
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={recordingState === 'recording' ? 'Detener audio' : 'Grabar audio'}
            accessibilityRole="button"
            onPress={() => { handleVoiceAction(); }}
            disabled={!canRecord || isSubmitting}
            style={({ pressed }) => [
              styles.voiceButton,
              recordingState === 'recording'
                ? styles.voiceButtonRecording
                : recordingState === 'uploading'
                  ? styles.voiceButtonLoading
                  : undefined,
              pressed && canRecord && !isSubmitting ? styles.controlPressed : undefined,
              (!canRecord || isSubmitting) ? styles.voiceButtonDisabled : undefined,
            ]}>
            {recordingState === 'uploading' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <MaterialCommunityIcons
                name={recordingState === 'recording' ? 'stop-circle-outline' : 'microphone'}
                size={20}
                color="#FFFFFF"
              />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}
