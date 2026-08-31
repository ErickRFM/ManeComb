import { useMemo } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { getTextInputProps } from '@/src/utils/text-input-props';
import { createStyles } from '../profile-edit-screen.styles';

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: TextInputProps['autoComplete'];
  secureTextEntry?: boolean;
  textContentType?: TextInputProps['textContentType'];
};

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  autoCapitalize = 'sentences',
  autoComplete,
  secureTextEntry = false,
  textContentType,
}: FieldProps) {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...getTextInputProps(theme, {
          autoComplete: autoComplete || (secureTextEntry ? 'current-password' : 'off'),
          returnKeyType: 'done',
          submitBehavior: 'blurAndSubmit',
        })}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        textContentType={textContentType}
        accessibilityLabel={label}
        style={styles.input}
      />
    </View>
  );
}
