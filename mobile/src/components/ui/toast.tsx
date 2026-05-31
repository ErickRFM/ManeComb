import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ToastProps = {
  message: string | null;
  tone?: 'success' | 'danger' | 'info';
  onDismiss?: () => void;
};

export function Toast({ message, tone = 'info', onDismiss }: ToastProps) {
  const { theme } = useAppTheme();

  if (!message) {
    return null;
  }

  const color =
    tone === 'danger' ? theme.colors.danger : tone === 'success' ? theme.colors.success : theme.colors.info;
  const background =
    tone === 'danger' ? theme.colors.dangerSoft : tone === 'success' ? theme.colors.successSoft : theme.colors.infoSoft;

  return (
    <Pressable onPress={onDismiss} style={[styles.toast, { backgroundColor: background, borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
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
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
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
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    minWidth: 0,
  },
});
