import { ActivityIndicator, Pressable, Text } from 'react-native';
import { authStyles as s } from '../auth.styles';

type Props = {
  isRegister: boolean;
  submitting: boolean;
  disabled: boolean;
  onSubmit: () => void;
};

export function AuthSubmitButton({ isRegister, submitting, disabled, onSubmit }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isRegister ? 'Crear cuenta' : 'Entrar'}
      onPress={onSubmit}
      disabled={submitting}
      style={({ pressed }) => [
        s.primaryButton,
        pressed && !submitting ? s.pressed : undefined,
        submitting ? s.disabled : undefined,
      ]}>
      {submitting ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <Text style={s.primaryButtonText}>{isRegister ? 'Crear cuenta' : 'Entrar'}</Text>
      )}
    </Pressable>
  );
}
