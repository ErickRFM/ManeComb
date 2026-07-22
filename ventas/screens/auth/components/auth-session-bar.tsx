import { Pressable, Text, View } from 'react-native';
import { authStyles as s } from '../auth.styles';

type Props = {
  rememberSession: boolean;
  disabled: boolean;
  onToggleRemember: () => void;
  onForgotPassword: () => void;
};

export function AuthSessionBar({ rememberSession, disabled, onToggleRemember, onForgotPassword }: Props) {
  return (
    <View style={s.sessionRow}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel="Recordarme"
        accessibilityState={{ checked: rememberSession }}
        onPress={onToggleRemember}
        style={s.rememberButton}>
        <View style={[s.checkbox, rememberSession ? s.checkboxActive : undefined]}>
          {rememberSession ? <View style={s.checkboxDot} /> : null}
        </View>
        <Text style={s.smallActionText}>Recordarme</Text>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Recuperar acceso"
        disabled={disabled}
        onPress={onForgotPassword}>
        <Text style={s.smallActionText}>Recuperar acceso</Text>
      </Pressable>
    </View>
  );
}
