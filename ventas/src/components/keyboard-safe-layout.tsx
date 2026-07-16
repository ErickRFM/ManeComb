import { forwardRef, type ComponentProps, type PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';

type KeyboardAvoidingViewProps = ComponentProps<typeof KeyboardAvoidingView>;
type ScrollViewProps = ComponentProps<typeof ScrollView>;

export function KeyboardSafeView({ children, keyboardVerticalOffset = 0, ...props }: PropsWithChildren<KeyboardAvoidingViewProps>) {
  return (
    <KeyboardAvoidingView
      {...props}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS !== 'web'}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      {children}
    </KeyboardAvoidingView>
  );
}

export const KeyboardSafeScrollView = forwardRef<ScrollView, ScrollViewProps>(function KeyboardSafeScrollView(
  { children, keyboardDismissMode, keyboardShouldPersistTaps = 'handled', ...props },
  ref
) {
  return (
    <KeyboardSafeView style={{ flex: 1 }}>
      <ScrollView
        {...props}
        ref={ref}
        automaticallyAdjustKeyboardInsets={false}
        keyboardDismissMode={keyboardDismissMode || (Platform.OS === 'ios' ? 'interactive' : 'on-drag')}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
        {children}
      </ScrollView>
    </KeyboardSafeView>
  );
});
