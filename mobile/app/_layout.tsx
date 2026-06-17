import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, type ErrorBoundaryProps } from '@/src/navigation/router';
import { StatusBar } from '@/src/native/status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome } from '@/src/utils/account-routing';
import { addPushResponseListener } from '@/src/utils/push-notifications';

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { theme } = useAppTheme();

  return (
    <View style={[styles.loader, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.errorTitle, { color: theme.colors.text }]}>
        ManeComb necesita reiniciar esta vista.
      </Text>
      <Text style={[styles.errorText, { color: theme.colors.muted }]} numberOfLines={4}>
        {error.message || 'Ocurrio un error inesperado.'}
      </Text>
      <Text onPress={retry} style={[styles.retryText, { color: theme.colors.accent }]}>
        Reintentar
      </Text>
    </View>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const { navigationTheme, theme } = useAppTheme();
  const splashHiddenRef = useRef(false);
  const { authContext, handlePushIntent, initialize, isHydrated, isBootstrapping, user } = useAppStore(useShallow((state) => ({
    authContext: state.authContext,
    handlePushIntent: state.handlePushIntent,
    initialize: state.initialize,
    isHydrated: state.isHydrated,
    isBootstrapping: state.isBootstrapping,
    user: state.user,
  })));

  const hideSplash = useCallback(() => {
    if (splashHiddenRef.current) {
      return;
    }

    splashHiddenRef.current = true;
  }, []);
  const isReady = isHydrated && !isBootstrapping;
  const hideSplashWhenReady = useCallback(() => {
    if (isReady) {
      hideSplash();
    }
  }, [hideSplash, isReady]);

  useEffect(() => {
    initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (isReady) {
      hideSplash();
    }
  }, [hideSplash, isReady]);

  useEffect(() => {
    const timeout = setTimeout(hideSplash, 2500);
    return () => clearTimeout(timeout);
  }, [hideSplash]);

  useEffect(() => {
    return addPushResponseListener(async (intent) => {
      if (!user) {
        router.push('/login');
        return;
      }

      await handlePushIntent(intent);

      if (intent.target === 'chat') {
        router.push('/chat');
        return;
      }

      if (intent.target === 'radio') {
        router.push('/radio');
        return;
      }

      if (intent.target === 'sos' || intent.target === 'incidents') {
        router.push('/incidencias');
        return;
      }

      const home = getAuthenticatedHome(user, authContext);
      router.push((home === '/mapa' ? '/perfil' : home) as never);
    });
  }, [authContext, handlePushIntent, router, user]);

  return (
    <GestureHandlerRootView
      onLayout={hideSplashWhenReady}
      style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ThemeProvider value={navigationTheme}>
        {!isReady ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
            <Text style={[styles.loaderText, { color: theme.colors.text }]}>
              Sincronizando centro de control...
            </Text>
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: {
                backgroundColor: theme.colors.background,
              },
            }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="login" />
            <Stack.Screen name="registro" />
            <Stack.Screen name="aplicacion" />
            <Stack.Screen name="plan-blocked" />
            <Stack.Screen name="operational-onboarding" />
            <Stack.Screen name="sync-error" />
            <Stack.Screen name="comercial" />
            <Stack.Screen name="ventas" />
            <Stack.Screen name="portal" />
            <Stack.Screen name="perfil-comprador" />
            <Stack.Screen name="terminos" />
            <Stack.Screen name="privacidad" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="modal"
              options={{
                presentation: 'modal',
              }}
            />
          </Stack>
        )}
        <StatusBar style={theme.statusBar} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: AppTheme.spacing.md,
    paddingHorizontal: AppTheme.spacing.xl,
  },
  loaderText: {
    color: AppTheme.colors.text,
    fontFamily: Typography.body,
    fontSize: 15,
  },
  errorTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryText: {
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    paddingVertical: 10,
  },
});
