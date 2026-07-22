import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { Pressable, Text } from 'react-native';
import { portalPalette } from '../../portal-theme';
import { styles } from '../onboarding.styles';

export function KeyActionButton({
  accessibilityLabel,
  disabled,
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'danger' | 'info';
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel || label}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.keyActionButton,
        tone === 'danger' ? styles.keyDangerButton : undefined,
        tone === 'info' ? styles.keyInfoButton : undefined,
        disabled ? styles.disabledButton : undefined,
      ]}>
      <MaterialCommunityIcons
        name={icon}
        size={15}
        color={tone === 'danger' ? portalPalette.danger : tone === 'info' ? portalPalette.info : portalPalette.text}
      />
      <Text
        style={[
          styles.keyActionText,
          tone === 'danger' ? styles.keyDangerText : undefined,
          tone === 'info' ? styles.keyInfoText : undefined,
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
