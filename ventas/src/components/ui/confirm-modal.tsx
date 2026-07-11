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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} accessibilityViewIsModal>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <View style={[styles.panel, { backgroundColor: theme.colors.card, borderColor: theme.colors.line }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={[styles.button, { borderColor: theme.colors.line }]}>
              <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
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
    gap: 10,
    justifyContent: 'flex-end',
  },
  button: {
    alignItems: 'center',
    borderRadius: DesignSystem.radius.control,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: DesignSystem.control.sm,
    minWidth: 120,
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
