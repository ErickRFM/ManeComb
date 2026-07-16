import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  processing?: boolean;
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
  processing = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onCancel} accessibilityViewIsModal>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.line }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={processing} onPress={onCancel} style={[styles.button, processing ? styles.disabled : undefined, { borderColor: theme.colors.line }]}>
              <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={processing}
              onPress={onConfirm}
              style={[
                styles.button,
                styles.confirmButton,
                processing ? styles.disabled : undefined,
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
  disabled: {
    opacity: 0.6,
  },
  overlay: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: DesignSystem.spacing.lg,
  },
  panel: {
    borderRadius: DesignSystem.radius.sheet,
    borderWidth: 1,
    gap: 12,
    maxWidth: 440,
    padding: DesignSystem.spacing.lg,
    width: '100%',
  },
  title: {
    fontFamily: Typography.display,
    fontSize: DesignSystem.typography.title.size,
    fontWeight: DesignSystem.typography.title.weight,
    lineHeight: DesignSystem.typography.title.lineHeight,
  },
  description: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.body.size,
    lineHeight: DesignSystem.typography.body.lineHeight,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
  },
  button: {
    alignItems: 'center',
    borderRadius: DesignSystem.radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: DesignSystem.control.sm,
    flexGrow: 1,
    minWidth: 112,
    paddingHorizontal: 16,
  },
  confirmButton: {
    borderWidth: 0,
  },
  cancelText: {
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: '900',
  },
  confirmText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: '900',
  },
});
