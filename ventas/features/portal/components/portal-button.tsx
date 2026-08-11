import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { AppTheme, DesignSystem, Typography } from '@/constants/theme';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { portalButtonGradient, portalPalette } from '../portal-theme';

export type PortalButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'icon';
export type PortalButtonSize = 'sm' | 'md' | 'lg';

type PortalButtonProps = {
  accessibilityLabel?: string;
  children?: ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  loading?: boolean;
  onPress: () => void;
  size?: PortalButtonSize;
  variant?: PortalButtonVariant;
};

export function PortalButton({
  accessibilityLabel,
  children,
  disabled = false,
  fullWidth = false,
  icon,
  loading = false,
  onPress,
  size = 'md',
  variant = 'primary',
}: PortalButtonProps) {
  const inactive = disabled || loading;
  const iconOnly = children == null;
  const foreground = variant === 'danger' ? portalPalette.danger : portalPalette.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ hovered, pressed }: any) => [
        styles.base,
        getSizeStyle(size),
        variant === 'primary' ? portalButtonGradient() : undefined,
        variant === 'secondary' ? styles.secondary : undefined,
        variant === 'danger' ? styles.danger : undefined,
        variant === 'ghost' ? styles.ghost : undefined,
        variant === 'icon' ? styles.icon : undefined,
        iconOnly ? styles.iconOnly : undefined,
        fullWidth ? styles.fullWidth : undefined,
        hovered ? styles.hovered : undefined,
        pressed ? styles.pressed : undefined,
        inactive ? styles.disabled : undefined,
      ]}>
      {loading ? (
        <ActivityIndicator color={foreground} size={getIconSize(size)} />
      ) : icon ? (
        <MaterialCommunityIcons color={foreground} name={icon} size={getIconSize(size)} />
      ) : null}
      {children != null ? <Text style={[styles.label, { color: foreground }]}>{children}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: AppTheme.radius.sm,
    flexDirection: 'row',
    flexShrink: 0,
    gap: AppTheme.spacing.xs,
    justifyContent: 'center',
  },
  sizeSm: {
    minHeight: DesignSystem.control.touch,
    paddingHorizontal: AppTheme.spacing.sm,
  },
  sizeMd: {
    minHeight: DesignSystem.control.md,
    paddingHorizontal: AppTheme.spacing.md,
  },
  sizeLg: {
    minHeight: DesignSystem.control.lg,
    paddingHorizontal: AppTheme.spacing.lg,
  },
  secondary: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.lineStrong,
    borderWidth: 1,
  },
  danger: {
    backgroundColor: portalPalette.dangerSoft,
    borderColor: portalPalette.danger,
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: portalPalette.surfaceSoft,
  },
  icon: {
    backgroundColor: portalPalette.surfaceSoft,
    borderColor: portalPalette.line,
    borderRadius: AppTheme.radius.xs,
    borderWidth: 1,
  },
  iconOnly: {
    aspectRatio: 1,
    paddingHorizontal: AppTheme.spacing.xs,
  },
  fullWidth: {
    alignSelf: 'stretch',
    width: '100%',
  },
  hovered: {
    opacity: DesignSystem.opacity.pressed,
  },
  pressed: {
    opacity: DesignSystem.opacity.pressed,
  },
  disabled: {
    opacity: DesignSystem.opacity.disabled,
  },
  label: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: DesignSystem.typography.caption.size,
    fontWeight: DesignSystem.typography.caption.weight,
    lineHeight: DesignSystem.typography.caption.lineHeight,
    textAlign: 'center',
  },
});

function getSizeStyle(size: PortalButtonSize) {
  if (size === 'sm') return styles.sizeSm;
  if (size === 'lg') return styles.sizeLg;
  return styles.sizeMd;
}

function getIconSize(size: PortalButtonSize) {
  if (size === 'sm') return DesignSystem.icon.xs;
  if (size === 'lg') return DesignSystem.icon.md;
  return DesignSystem.icon.sm;
}
