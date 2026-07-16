import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  processing?: boolean;
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
  processing = false,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const { theme } = useAppTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={processing ? undefined : onCancel}>
      <View style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}>
        <View style={[styles.modal, { backgroundColor: theme.colors.card, borderColor: theme.colors.line }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
          {description ? <Text style={[styles.description, { color: theme.colors.muted }]}>{description}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={processing}
              style={[styles.button, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }]}>
              <Text style={[styles.cancelText, { color: theme.colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={processing}
              style={[
                styles.button,
                styles.primary,
                { backgroundColor: danger ? theme.colors.danger : theme.colors.accent },
              ]}>
              {processing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: DesignSystem.spacing.lg },
  modal: { borderRadius: DesignSystem.radius.sheet, borderWidth: 1, gap: 12, maxWidth: 440, padding: DesignSystem.spacing.lg, width: '100%' },
  title: { fontFamily: Typography.display, fontSize: DesignSystem.typography.title.size, fontWeight: DesignSystem.typography.title.weight, lineHeight: DesignSystem.typography.title.lineHeight },
  description: { fontFamily: Typography.body, fontSize: DesignSystem.typography.body.size, lineHeight: DesignSystem.typography.body.lineHeight },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 6 },
  button: { alignItems: 'center', borderRadius: DesignSystem.radius.control, borderWidth: 1, minHeight: DesignSystem.control.sm, minWidth: 120, paddingHorizontal: 16, paddingVertical: 10 },
  primary: { borderWidth: 0 },
  cancelText: { fontFamily: Typography.body, fontSize: DesignSystem.typography.caption.size, fontWeight: '900' },
  primaryText: { color: '#FFFFFF', fontFamily: Typography.body, fontSize: DesignSystem.typography.caption.size, fontWeight: '900' },
});
