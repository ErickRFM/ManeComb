import { forwardRef, type ComponentProps, type PropsWithChildren } from 'react';
import { Platform, ScrollView, View } from 'react-native';

type ViewProps = ComponentProps<typeof View>;
type ScrollViewProps = ComponentProps<typeof ScrollView>;

export function KeyboardSafeView({ children, ...props }: PropsWithChildren<ViewProps>) {
  return <View {...props}>{children}</View>;
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
