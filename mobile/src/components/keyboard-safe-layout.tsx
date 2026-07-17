import { forwardRef, type ComponentProps, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, type ScrollViewProps } from 'react-native';
import {
  KeyboardAvoidingView as KeyboardControllerAvoidingView,
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewRef,
} from 'react-native-keyboard-controller';

type KeyboardSafeViewProps = ComponentProps<typeof KeyboardControllerAvoidingView>;

export function KeyboardSafeView({
  behavior = 'padding',
  children,
  ...props
}: PropsWithChildren<KeyboardSafeViewProps>) {
  return (
    <KeyboardControllerAvoidingView
      {...props}
      behavior={behavior}
      automaticOffset
      enabled={Platform.OS !== 'web'}>
      {children}
    </KeyboardControllerAvoidingView>
  );
}

export const KeyboardSafeScrollView = forwardRef<KeyboardAwareScrollViewRef, ScrollViewProps>(
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
      <KeyboardAwareScrollView
        {...props}
        ref={ref}
        automaticallyAdjustKeyboardInsets={false}
        keyboardDismissMode={
          keyboardDismissMode || (Platform.OS === 'ios' ? 'interactive' : 'on-drag')
        }
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        mode="insets"
        style={[styles.fill, props.style]}>
        {children}
      </KeyboardAwareScrollView>
    );
  }
);

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
