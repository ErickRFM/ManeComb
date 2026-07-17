import { forwardRef, type PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  type KeyboardAvoidingViewProps,
  type ScrollViewProps,
} from 'react-native';

export function KeyboardSafeView({
  behavior = Platform.OS === 'ios' ? 'padding' : undefined,
  children,
  keyboardVerticalOffset = 0,
  ...props
}: PropsWithChildren<KeyboardAvoidingViewProps>) {
  return (
    <KeyboardAvoidingView
      {...props}
      behavior={behavior}
      enabled={Platform.OS !== 'web'}
      keyboardVerticalOffset={keyboardVerticalOffset}>
      {children}
    </KeyboardAvoidingView>
  );
}

export const KeyboardSafeScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardSafeScrollViewComponent(
    {
      children,
      keyboardDismissMode,
      keyboardShouldPersistTaps = 'handled',
      ...props
    },
    ref
  ) {
    return (
      <KeyboardSafeView style={styles.fill}>
        <ScrollView
          {...props}
          ref={ref}
          automaticallyAdjustKeyboardInsets={false}
          keyboardDismissMode={
            keyboardDismissMode || (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
          }
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}>
          {children}
        </ScrollView>
      </KeyboardSafeView>
    );
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
