import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, Typography, type DesignTone } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ToastProps = {
  message?: string | null;
  tone?: Extract<DesignTone, 'info' | 'positive' | 'warning' | 'danger'> | 'success';
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
    <View style={[styles.toast, { backgroundColor: colors.background, borderColor: colors.border }]}>
      <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: colors.foreground }]}>Cerrar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ToastProvider(props: ToastProps) {
  return <Toast {...props} />;
}

const styles = StyleSheet.create({
  toast: {
    borderRadius: DesignSystem.radius.control,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: DesignSystem.spacing.md,
    paddingVertical: DesignSystem.spacing.sm,
  },
  message: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: DesignSystem.typography.caption.weight,
    lineHeight: DesignSystem.typography.caption.lineHeight,
  },
  closeButton: {
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: '900',
  },
});
