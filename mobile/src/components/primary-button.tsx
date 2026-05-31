import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  compact?: boolean;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'solid' | 'ghost';
  style?: StyleProp<ViewStyle>;
};

export function PrimaryButton({
  accessibilityLabel,
  compact,
  icon,
  label,
  onPress,
  loading,
  disabled,
  variant = 'solid',
  style,
}: PrimaryButtonProps) {
  const { theme } = useAppTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.compactButton : undefined,
        variant === 'ghost'
          ? [styles.ghost, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.line }]
          : [styles.solid, { backgroundColor: theme.colors.accent, borderColor: theme.colors.accent }],
        Platform.OS === 'web' ? styles.webButton : undefined,
        style,
        pressed && !isDisabled ? styles.pressed : undefined,
        isDisabled ? styles.disabled : undefined,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'ghost' ? theme.colors.text : '#FFFFFF'} />
      ) : (
        <>
          {icon ? (
            <MaterialCommunityIcons
              name={icon}
              size={compact ? 17 : 18}
              color={variant === 'ghost' ? theme.colors.text : '#FFFFFF'}
            />
          ) : null}
          <Text
            numberOfLines={1}
            style={[
              styles.label,
              variant === 'ghost' ? { color: theme.colors.text } : styles.solidLabel,
            ]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    minWidth: 0,
    borderRadius: AppTheme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AppTheme.spacing.md,
    borderWidth: 1,
  },
  compactButton: {
    minHeight: 40,
    paddingHorizontal: 12,
  },
  webButton: {
    cursor: 'pointer' as any,
  },
  solid: {},
  ghost: {},
  pressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    flexShrink: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0,
    textAlign: 'center',
  },
  solidLabel: {
    color: '#FFFFFF',
  },
});
