import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import type { IncomingCall } from '../types';

type IncomingCallModalProps = {
  call: IncomingCall | null;
  isAnswering: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export function IncomingCallModal({ call, isAnswering, onAccept, onReject }: IncomingCallModalProps) {
  const { theme } = useAppTheme();

  return (
    <Modal
      visible={Boolean(call)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onReject}>
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.line,
            },
          ]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.colors.accentSoft }]}>
            <MaterialCommunityIcons
              name={call?.mode === 'video' ? 'video-outline' : 'phone-outline'}
              size={34}
              color={theme.colors.accent}
            />
          </View>

          <Text style={[styles.eyebrow, { color: theme.colors.accent }]}>Llamada entrante</Text>
          <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={2}>
            {call?.caller.name || 'Operador ManeComb'}
          </Text>
          <Text style={[styles.detail, { color: theme.colors.muted }]}>
            {call?.mode === 'video' ? 'Videollamada operativa' : 'Llamada de audio operativa'}
          </Text>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Rechazar llamada"
              disabled={isAnswering}
              onPress={onReject}
              style={({ pressed }) => [
                styles.action,
                styles.reject,
                { backgroundColor: theme.colors.danger },
                pressed ? styles.pressed : undefined,
                isAnswering ? styles.disabled : undefined,
              ]}>
              <MaterialCommunityIcons name="phone-hangup" size={22} color="#FFFFFF" />
              <Text style={styles.actionText}>Rechazar</Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Contestar llamada"
              accessibilityState={{ busy: isAnswering, disabled: isAnswering }}
              disabled={isAnswering}
              onPress={onAccept}
              style={({ pressed }) => [
                styles.action,
                styles.accept,
                { backgroundColor: theme.colors.success },
                pressed ? styles.pressed : undefined,
                isAnswering ? styles.disabled : undefined,
              ]}>
              <MaterialCommunityIcons
                name={isAnswering ? 'progress-clock' : 'phone'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.actionText}>{isAnswering ? 'Conectando' : 'Contestar'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(5, 8, 14, 0.82)',
  },
  card: {
    width: '100%',
    maxWidth: 390,
    borderWidth: 1,
    borderRadius: AppTheme.radius.lg,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  eyebrow: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  name: {
    fontFamily: Typography.display,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
  },
  detail: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 16,
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: 12,
  },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  reject: {},
  accept: {},
  actionText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.58,
  },
});
