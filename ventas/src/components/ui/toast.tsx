import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DesignSystem, getToneColors, palette, Typography, type DesignTone } from '@/constants/theme';
import { slideInDown, transition } from '@/src/native/motion';

type ToastProps = {
  message?: string | null;
  tone?: Extract<DesignTone, 'info' | 'positive' | 'warning' | 'danger'> | 'success';
  onDismiss?: () => void;
};

export function Toast({ message, tone = 'info', onDismiss }: ToastProps) {
  if (!message) {
    return null;
  }

  const normalizedTone = tone === 'success' ? 'positive' : tone;
  const colors = getToneColors(normalizedTone);

  return (
    <View
      style={[
        styles.toast,
        { backgroundColor: colors.background, borderColor: colors.border },
        slideInDown(),
      ]}>
      <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} style={[styles.closeButton, transition('opacity', 140)]}>
          <Text style={[styles.closeText, { color: colors.foreground }]}>Cerrar</Text>
        </Pressable>
      ) : null}
    </View>
  );
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
