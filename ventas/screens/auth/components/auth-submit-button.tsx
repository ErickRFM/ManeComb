import { ActivityIndicator, Pressable, Text } from 'react-native';
import { authStyles as s } from '../auth.styles';

type Props = {
  accessibilityLabel?: string;
  isRegister?: boolean;
  label?: string;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
};

export function AuthSubmitButton({ accessibilityLabel, isRegister = false, label, submitting, disabled, onSubmit }: Props) {
  const resolvedLabel = label || (isRegister ? 'Crear cuenta' : 'Entrar');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || resolvedLabel}
      accessibilityState={{ busy: submitting, disabled }}
      onPress={onSubmit}
      disabled={disabled}
      style={({ pressed }) => [
        s.primaryButton,
        pressed && !disabled ? s.pressed : undefined,
        disabled ? s.disabled : undefined,
      ]}>
      {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={s.primaryButtonText}>{resolvedLabel}</Text>}
    </Pressable>
  );
}
