import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.line }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={[styles.button, { borderColor: theme.colors.line }]}>
              <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[
                styles.button,
                styles.confirmButton,
                { backgroundColor: destructive ? theme.colors.danger : theme.colors.accent },
              ]}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: AppTheme.spacing.lg,
    width: '100%',
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 20,
    fontWeight: '900',
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  button: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  confirmButton: {
    borderWidth: 0,
  },
  cancelText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '800',
  },
  confirmText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
});
