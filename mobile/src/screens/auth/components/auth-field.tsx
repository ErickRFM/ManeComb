import { useState, type Ref } from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { getTextInputProps } from '@/src/utils/text-input-props';
import { styles } from '../customer-auth-screen.styles';

export function AuthField({
  autoComplete,
  autoCapitalize = 'sentences',
  autoCorrect = true,
  inputRef,
  keyboardType = 'default',
  label,
  onBlur,
  onChangeText,
  onSubmitEditing,
  placeholder,
  returnKeyType,
  submitBehavior,
  secureTextEntry = false,
  textContentType,
  value,
}: {
  autoComplete?: TextInputProps['autoComplete'];
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  inputRef?: Ref<TextInput>;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  label: string;
  onBlur?: () => void;
  onChangeText: (value: string) => void;
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  placeholder: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  submitBehavior?: TextInputProps['submitBehavior'];
  secureTextEntry?: boolean;
  textContentType?: TextInputProps['textContentType'];
  value: string;
}) {
  const { theme } = useAppTheme();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const inputProps = getTextInputProps(theme, { autoComplete, returnKeyType, submitBehavior, textContentType });
  const showPasswordToggle = secureTextEntry;
  const webInputStyle =
    Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          outlineWidth: 0,
          boxShadow: 'none',
        } as any)
      : null;

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.inputShell,
          focused ? { borderColor: theme.colors.accent } : undefined,
        ]}>
        <TextInput
          ref={inputRef}
          {...inputProps}
          value={value}
          onChangeText={onChangeText}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          onFocus={() => setFocused(true)}
          onSubmitEditing={onSubmitEditing}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          secureTextEntry={secureTextEntry && !passwordVisible}
          placeholder={placeholder}
          style={[styles.input, showPasswordToggle ? styles.inputWithToggle : undefined, webInputStyle]}
        />
        {showPasswordToggle ? (
          <Pressable
            accessibilityLabel={passwordVisible ? 'Ocultar contrasena' : 'Mostrar contrasena'}
            accessibilityRole="button"
            onPress={() => setPasswordVisible((current) => !current)}
            style={styles.passwordToggle}>
            <MaterialCommunityIcons
              name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color="#333333"
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
