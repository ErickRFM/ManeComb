import { DesignSystem } from '@/constants/theme';
import { forwardRef, type ComponentProps, type PropsWithChildren } from 'react';
import { Platform, StyleSheet, useWindowDimensions, type ScrollViewProps } from 'react-native';
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
  const { width } = useWindowDimensions();
  const isLargeScreen = width >= DesignSystem.breakpoints.phone;
  const resolvedBehavior =
    Platform.OS === 'android' && behavior === 'translate-with-padding' && isLargeScreen
      ? 'padding'
      : behavior;

  return (
    <KeyboardControllerAvoidingView
      {...props}
      behavior={resolvedBehavior}
      automaticOffset
      enabled={Platform.OS !== 'web'}>
      {children}
    </KeyboardControllerAvoidingView>
  );
}

type KeyboardSafeScrollViewProps = ScrollViewProps &
  Pick<ComponentProps<typeof KeyboardAwareScrollView>, 'bottomOffset'>;

export const KeyboardSafeScrollView = forwardRef<KeyboardAwareScrollViewRef, KeyboardSafeScrollViewProps>(
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
