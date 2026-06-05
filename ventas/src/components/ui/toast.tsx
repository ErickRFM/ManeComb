import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ToastProps = {
  message?: string | null;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  onDismiss?: () => void;
};

export function Toast({ message, tone = 'info', onDismiss }: ToastProps) {
  const { theme } = useAppTheme();

  if (!message) {
    return null;
  }

  const color =
    tone === 'success' ? theme.colors.success : tone === 'warning' ? theme.colors.warning : tone === 'danger' ? theme.colors.danger : theme.colors.info;
  const background =
    tone === 'success' ? theme.colors.successSoft : tone === 'warning' ? theme.colors.warningSoft : tone === 'danger' ? theme.colors.dangerSoft : theme.colors.infoSoft;

  return (
    <View style={[styles.toast, { backgroundColor: background, borderColor: color }]}>
      <Text style={[styles.message, { color: theme.colors.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} style={styles.closeButton}>
          <Text style={[styles.closeText, { color }]}>Cerrar</Text>
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
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: AppTheme.spacing.sm,
  },
  message: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  closeButton: {
    justifyContent: 'center',
  },
  closeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    fontWeight: '900',
  },
});
