import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, palette, Typography } from '@/constants/theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  processing?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
};

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  processing = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  const cancelInactive = processing;
  const confirmInactive = processing || confirmDisabled;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onCancel} accessibilityViewIsModal>
      <View style={[styles.overlay, { backgroundColor: palette.overlay }]}>
        <View style={[styles.panel, { backgroundColor: palette.card, borderColor: palette.line }]}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: palette.muted }]}>{description}</Text> : null}
          {children}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: processing, disabled: cancelInactive }}
              disabled={cancelInactive}
              onPress={onCancel}
              style={[styles.button, cancelInactive ? styles.disabled : undefined, { borderColor: palette.line }]}>
              <Text style={[styles.cancelText, { color: palette.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: processing, disabled: confirmInactive }}
              disabled={confirmInactive}
              onPress={onConfirm}
              style={[
                styles.button,
                styles.confirmButton,
                confirmInactive ? styles.disabled : undefined,
                { backgroundColor: destructive ? palette.danger : palette.accent },
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
