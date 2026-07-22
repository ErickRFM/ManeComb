import { Pressable, Text, View } from 'react-native';
import type { AuthMode } from '../auth.types';
import { authStyles as s } from '../auth.styles';

type Props = {
  currentMode: AuthMode;
  onSelectMode: (mode: AuthMode) => void;
};

export function AuthModeSelector({ currentMode, onSelectMode }: Props) {
  return (
    <View style={s.segmentedControl}>
      <SegmentButton
        label="Iniciar sesión"
        active={currentMode === 'login'}
        onPress={() => onSelectMode('login')}
      />
      <SegmentButton
        label="Registrarse"
        active={currentMode === 'register'}
        onPress={() => onSelectMode('register')}
      />
    </View>
  );
}

function SegmentButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        s.segmentButton,
        active ? s.segmentButtonActive : undefined,
        pressed ? s.pressed : undefined,
      ]}>
      <Text style={[s.segmentText, active ? s.segmentTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
}
