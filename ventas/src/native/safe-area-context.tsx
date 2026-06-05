import type { PropsWithChildren } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export function SafeAreaProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function SafeAreaView({
  children,
  style,
  ...props
}: PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
}>) {
  return (
    <View {...props} style={[{ flex: 1 }, style]}>
      {children}
    </View>
  );
}

export function useSafeAreaInsets() {
  return {
    bottom: 0,
    left: 0,
    right: 0,
    top: 0,
  };
}
