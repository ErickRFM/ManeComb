import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { authStyles as s } from '../auth.styles';

type Props = {
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
};

export function AuthField({
  autoCapitalize = 'sentences',
  icon,
  keyboardType = 'default',
  label,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  value,
}: Props) {
  const [isFocused, setFocused] = useState(false);
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const webInputStyle =
    Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          boxShadow: 'none',
        } as any)
      : null;

  return (
    <View style={s.field}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={[s.inputShell, isFocused ? s.inputShellFocused : undefined]}>
        <MaterialCommunityIcons
          name={icon}
          size={19}
          color={isFocused ? '#FF4D7D' : 'rgba(216, 226, 245, 0.62)'}
        />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          placeholder={placeholder}
          placeholderTextColor="rgba(216, 226, 245, 0.38)"
          selectionColor="#FF4D7D"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[s.input, webInputStyle]}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            hitSlop={8}
            onPress={() => setPasswordVisible((current) => !current)}
            style={s.passwordToggle}>
            <MaterialCommunityIcons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={19}
              color={isFocused ? '#FF4D7D' : 'rgba(216, 226, 245, 0.62)'}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
