import { useEffect, useState, type ReactNode } from 'react';
import { Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardSafeScrollView } from '@/src/components/keyboard-safe-layout';
import { router } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { AuthBackground } from '@/screens/auth/components/auth-shell';
import { AuthHeader } from '@/screens/auth/components/auth-header';
import { AuthLegalLinks } from '@/screens/auth/components/auth-legal-links';
import { authStyles as s } from '@/screens/auth/auth.styles';

export function useSlowRequest(active: boolean) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return undefined;
    }
    const timer = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(timer);
  }, [active]);
  return slow;
}

export function PasswordRecoveryLayout({ backTo, children, subtitle, title }: {
  backTo?: string | { pathname: string; params?: Record<string, string> };
  children: ReactNode;
  subtitle: string;
  title: string;
}) {
  const { height, width } = useWindowDimensions();
  const compact = height < 720;
  return (
    <SafeAreaView style={s.safeArea}>
      <StatusBar style="light" />
      <AuthBackground />
      <KeyboardSafeScrollView
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[s.scrollContent, {
          minHeight: Platform.OS === 'web' ? '100dvh' as any : undefined,
          padding: width < 390 ? 16 : 20,
        }]}
        style={s.scroll}>
        <View style={[s.panel, { maxWidth: 430 }]}>
          <View style={[s.form, { gap: compact ? 12 : 16, padding: width < 390 ? 16 : 22 }]}>
            <AuthHeader isRegister={false} logoSize={compact ? 'sm' : 'md'} title={title} subtitle={subtitle} />
            {backTo ? (
              <Pressable accessibilityRole="button" onPress={() => router.replace(backTo)}>
                <Text style={s.smallActionText}>← Volver</Text>
              </Pressable>
            ) : null}
            {children}
            <AuthLegalLinks />
          </View>
        </View>
      </KeyboardSafeScrollView>
    </SafeAreaView>
  );
}
