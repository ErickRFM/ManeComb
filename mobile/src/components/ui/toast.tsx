import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, Typography, type DesignTone } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ToastProps = {
  message: string | null;
  tone?: Extract<DesignTone, 'positive' | 'danger' | 'info'> | 'success';
  onDismiss?: () => void;
};

export function Toast({ message, tone = 'info', onDismiss }: ToastProps) {
  const { theme } = useAppTheme();

  if (!message) {
    return null;
  }

  const normalizedTone = tone === 'success' ? 'positive' : tone;
  const colors = getToneColors(theme, normalizedTone);

  return (
    <Pressable onPress={onDismiss} style={[styles.toast, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <View style={[styles.dot, { backgroundColor: colors.foreground }]} />
      <Text style={[styles.text, { color: theme.colors.text }]}>{message}</Text>
    </Pressable>
  );
}

export function ToastProvider({ message, tone, onDismiss }: ToastProps) {
  return <Toast message={message} tone={tone} onDismiss={onDismiss} />;
}

const styles = StyleSheet.create({
  toast: {
    alignItems: 'flex-start',
    borderRadius: DesignSystem.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: DesignSystem.spacing.md,
    paddingVertical: DesignSystem.spacing.sm,
  },
  dot: {
    borderRadius: 8,
    flexShrink: 0,
    height: 8,
    marginTop: 5,
    width: 8,
  },
  text: {
    flex: 1,
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: DesignSystem.typography.caption.weight,
    lineHeight: DesignSystem.typography.caption.lineHeight,
    minWidth: 0,
  },
});
