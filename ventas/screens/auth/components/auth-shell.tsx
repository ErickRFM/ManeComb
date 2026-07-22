import { View } from 'react-native';
import { authStyles as s } from '../auth.styles';

export function AuthBackground() {
  return (
    <View pointerEvents="none" style={s.backgroundLayer}>
      <View style={s.backgroundBase} />
      <View style={s.backgroundGlowTop} />
      <View style={s.backgroundGlowBottom} />
    </View>
  );
}
