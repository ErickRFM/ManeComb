import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { getTextInputProps } from '@/src/utils/text-input-props';
import { MAX_VOICE_NOTE_SECONDS } from '../types';
import { formatDuration } from '../utils/conversation';
import type { useChatController } from '../hooks/use-chat-controller';

type ChatComposerProps = Pick<
  ReturnType<typeof useChatController>,
  | 'attachmentNotice'
  | 'canRecord'
  | 'canSendText'
  | 'composerPlaceholder'
  | 'draft'
  | 'handleSendText'
  | 'handleVoiceAction'
  | 'isNearMessagesBottomRef'
  | 'isSubmitting'
  | 'recordingSeconds'
  | 'recordingState'
  | 'recorderMessage'
  | 'scrollMessagesToEnd'
  | 'setAttachmentMenuOpen'
  | 'setDraft'
  | 'styles'
  | 'theme'
>;

export function ChatComposer({
  attachmentNotice,
  canRecord,
  canSendText,
  composerPlaceholder,
  draft,
  handleSendText,
  handleVoiceAction,
  isNearMessagesBottomRef,
  isSubmitting,
  recordingSeconds,
  recordingState,
  recorderMessage,
  scrollMessagesToEnd,
  setAttachmentMenuOpen,
  setDraft,
  styles,
  theme,
}: ChatComposerProps) {
  return (
    <View style={styles.composerShell}>
      {recorderMessage ? (
        <View style={styles.recorderHint}>
          <MaterialCommunityIcons
            name={recordingState === 'recording' ? 'record-rec' : 'information-outline'}
            size={16}
            color={recordingState === 'recording' ? theme.colors.accent : theme.colors.info}
          />
          <Text style={styles.recorderHintText}>
            {recordingState === 'recording'
              ? `${recorderMessage} ${formatDuration(recordingSeconds)} / ${formatDuration(MAX_VOICE_NOTE_SECONDS)}`
              : recorderMessage}
          </Text>
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
            onChangeText={setDraft}
            placeholder={composerPlaceholder}
            placeholderTextColor={theme.colors.muted}
            style={styles.composerInput}
            onFocus={() => {
              if (isNearMessagesBottomRef.current) {
                setTimeout(() => scrollMessagesToEnd(true), 80);
              }
            }}
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
