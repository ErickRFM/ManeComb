import { Platform, type TextInputProps } from 'react-native';
import type { AppThemeShape } from '@/src/hooks/use-app-theme';

type Options = {
  autoComplete?: TextInputProps['autoComplete'];
  returnKeyType?: TextInputProps['returnKeyType'];
  submitBehavior?: TextInputProps['submitBehavior'];
  textContentType?: TextInputProps['textContentType'];
};

export function getTextInputProps(theme: AppThemeShape, options: Options = {}): Pick<
  TextInputProps,
  | 'autoComplete'
  | 'autoCorrect'
  | 'cursorColor'
  | 'keyboardAppearance'
  | 'placeholderTextColor'
  | 'returnKeyType'
  | 'selectionColor'
  | 'spellCheck'
  | 'submitBehavior'
  | 'textContentType'
  | 'underlineColorAndroid'
> {
  return {
    autoComplete: options.autoComplete,
    autoCorrect: false,
    cursorColor: theme.colors.accent,
    keyboardAppearance: theme.mode === 'dark' ? 'dark' : 'light',
    placeholderTextColor: theme.colors.muted,
    returnKeyType: options.returnKeyType,
    selectionColor: Platform.OS === 'android' ? theme.colors.accentSoft : theme.colors.accent,
    spellCheck: false,
    submitBehavior: options.submitBehavior,
    textContentType: options.textContentType,
    underlineColorAndroid: 'transparent',
  };
}
