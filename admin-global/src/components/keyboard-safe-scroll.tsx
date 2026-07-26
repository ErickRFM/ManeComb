import { ScrollView, type ScrollViewProps } from 'react-native';

export function KeyboardSafeScrollView({ children, contentContainerStyle, ...props }: ScrollViewProps) {
  return (
    <ScrollView
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      {...props}
    >
      {children}
    </ScrollView>
  );
}
