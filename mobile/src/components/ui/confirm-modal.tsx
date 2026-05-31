import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmModal({
  visible,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <View style={[styles.modal, { backgroundColor: theme.colors.card, borderColor: theme.colors.line }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={[styles.button, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }]}>
              <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={[
                styles.button,
                styles.primary,
                { backgroundColor: danger ? theme.colors.danger : theme.colors.accent },
              ]}>
              <Text style={styles.primaryText}>{confirmLabel}</Text>
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
    padding: AppTheme.spacing.lg,
  },
  modal: {
    borderRadius: AppTheme.radius.md,
    borderWidth: 1,
    gap: 12,
    maxWidth: 440,
    padding: AppTheme.spacing.lg,
    width: '100%',
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'flex-end',
    marginTop: 6,
  },
  button: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    borderWidth: 1,
    minHeight: 42,
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primary: {
    borderWidth: 0,
  },
  cancelText: {
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
  primaryText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 13,
    fontWeight: '900',
  },
});
