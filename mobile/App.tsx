import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, ThemeProvider } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { ModalScreen } from '@/src/screens/modal-screen';
import { CustomerAuthScreen } from '@/src/screens/customer-auth-screen';
import { BuyerProfileScreen } from '@/src/screens/buyer-profile-screen';
import { ChecklistScreen } from '@/src/screens/checklist-screen';
import { ChatScreen } from '@/src/screens/chat-screen';
import { DashboardScreen } from '@/src/screens/dashboard-screen';
import { IncidentsScreen } from '@/src/screens/incidents-screen';
import { LegalScreen } from '@/src/screens/legal-screen';
import { MapScreen } from '@/src/screens/map-screen';
import { ProfileEditScreen } from '@/src/screens/profile-edit-screen';
import { ProfileScreen } from '@/src/screens/profile-screen';
import { RadioScreen } from '@/src/screens/radio-screen';
import { UsersScreen } from '@/src/screens/users-screen';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { navigationRef, Redirect, router } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';
import { getAuthenticatedHome, getOperationalHome, isCustomerAccount } from '@/src/utils/account-routing';
import { addPushResponseListener } from '@/src/utils/push-notifications';
import { StatusBar } from '@/src/native/status-bar';
import { SalesAuthScreen } from 'ventas/screens/sales-auth-screen';
import { PortalBillingScreen } from 'ventas/features/portal/screens/portal-billing-screen';
import { PortalDashboardScreen } from 'ventas/features/portal/screens/portal-dashboard-screen';
import { PortalOnboardingScreen } from 'ventas/features/portal/screens/portal-onboarding-screen';
import { PortalPaymentsScreen } from 'ventas/features/portal/screens/portal-payments-screen';
import { PortalPlanScreen } from 'ventas/features/portal/screens/portal-plan-screen';
import { PortalProfileScreen } from 'ventas/features/portal/screens/portal-profile-screen';
import { PortalUsersScreen } from 'ventas/features/portal/screens/portal-users-screen';

const Stack = createNativeStackNavigator();
const BOOT_SYNC_TIMEOUT_MS = 16000;

type AppStyles = ReturnType<typeof createStyles>;
type AppThemeValue = ReturnType<typeof useAppTheme>['theme'];

function RecoverableAppState({
  continueLabel,
  message,
  onContinue,
  onResetSession,
  onRetry,
  styles,
  theme,
  title,
}: {
  continueLabel?: string;
  message: string;
  onContinue?: () => void;
  onResetSession: () => void;
  onRetry: () => void;
  styles: AppStyles;
  theme: AppThemeValue;
  title: string;
}) {
  return (
    <View style={styles.recoveryScreen}>
      <View
        style={[
          styles.recoveryMark,
          {
            backgroundColor: theme.colors.accentSoft,
            borderColor: theme.colors.line,
          },
        ]}>
        <Text style={[styles.recoveryMarkText, { color: theme.colors.accent }]}>!</Text>
      </View>
      <Text style={[styles.recoveryTitle, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.recoveryMessage, { color: theme.colors.muted }]}>{message}</Text>
      <View style={styles.recoveryButtonGroup}>
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.recoveryPrimaryButton,
            { backgroundColor: theme.colors.accent },
            pressed ? styles.recoveryPressed : undefined,
        ]}>
          <Text style={styles.recoveryPrimaryText}>Reintentar</Text>
        </Pressable>
        {onContinue ? (
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [
              styles.recoverySecondaryButton,
              { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
              pressed ? styles.recoveryPressed : undefined,
            ]}>
            <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
              {continueLabel || 'Continuar'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onResetSession}
          style={({ pressed }) => [
            styles.recoverySecondaryButton,
            { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
            pressed ? styles.recoveryPressed : undefined,
          ]}>
          <Text style={[styles.recoverySecondaryText, { color: theme.colors.text }]}>
            Reiniciar sesion
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

class MobileErrorBoundary extends React.Component<
  {
    children: React.ReactNode;
    styles: AppStyles;
    theme: AppThemeValue;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[mobile:error-boundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  handleResetSession = () => {
    useAppStore
      .getState()
      .signOut()
      .finally(() => {
        this.setState({ error: null });
        router.replace('/login');
      });
  };

  render() {
    if (this.state.error) {
      return (
        <RecoverableAppState
          title="La app encontro un problema"
          message="El centro de control no pudo renderizarse. Puedes reintentar o iniciar sesion de nuevo."
          onRetry={this.handleRetry}
          onResetSession={this.handleResetSession}
          styles={this.props.styles}
          theme={this.props.theme}
        />
      );
    }

    return this.props.children;
  }
}

function InitialRoute() {
  const { isHydrated, user } = useAppStore(
    useShallow((state) => ({
      isHydrated: state.isHydrated,
      user: state.user,
    }))
  );

  if (!isHydrated) {
    return null;
  }

  if (!user) {
    return <LoginRoute />;
  }

  const home = getAuthenticatedHome(user);

  if (home === '/portal') {
    return <PortalDashboardScreen />;
  }

  return <MapScreen />;
}

function OperationalRoute({ children }: { children: React.ReactNode }) {
  const user = useAppStore((state) => state.user);

  if (!user) {
    return <Redirect href="/login" />;
  }

  return <>{children}</>;
}

function ApplicationRoute() {
  const user = useAppStore((state) => state.user);
  return <Redirect href={user ? getOperationalHome(user) : '/login'} />;
}

function CommercialRoute() {
  return <Redirect href="/ventas" />;
}

function NativeSalesRoute() {
  return <Redirect href="/login" />;
}

function PortalCommercialRoute() {
  return <Redirect href="/portal" />;
}

function TermsRoute() {
  return <LegalScreen kind="terms" />;
}

function PrivacyRoute() {
  return <LegalScreen kind="privacy" />;
}

function LoginRoute() {
  return <CustomerAuthScreen mode="login" />;
}

function RegisterRoute() {
  return <CustomerAuthScreen mode="register" />;
}

function SalesLoginRoute() {
  return <SalesAuthScreen mode="login" />;
}

function SalesRegisterRoute() {
  return <SalesAuthScreen mode="register" />;
}

function withOperationalScreen(component: React.ReactNode) {
  return <OperationalRoute>{component}</OperationalRoute>;
}

function AppStack() {
  return (
    <Stack.Navigator
      initialRouteName="/"
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: AppTheme.colors.background,
        },
      }}>
      <Stack.Screen name="/" component={InitialRoute} />
      <Stack.Screen name="/login" component={LoginRoute} />
      <Stack.Screen name="/registro" component={RegisterRoute} />
      <Stack.Screen name="/aplicacion" component={ApplicationRoute} />
      <Stack.Screen name="/comercial" component={CommercialRoute} />
      <Stack.Screen name="/ventas" component={NativeSalesRoute} />
      <Stack.Screen name="/ventas/login" component={SalesLoginRoute} />
      <Stack.Screen name="/ventas/registro" component={SalesRegisterRoute} />
      <Stack.Screen name="/portal" component={PortalDashboardScreen} />
      <Stack.Screen name="/portal/plan" component={PortalPlanScreen} />
      <Stack.Screen name="/portal/usuarios" component={PortalUsersScreen} />
      <Stack.Screen name="/portal/pagos" component={PortalPaymentsScreen} />
      <Stack.Screen name="/portal/facturacion" component={PortalBillingScreen} />
      <Stack.Screen name="/portal/perfil" component={PortalProfileScreen} />
      <Stack.Screen name="/portal/onboarding" component={PortalOnboardingScreen} />
      <Stack.Screen name="/portal/comercial" component={PortalCommercialRoute} />
      <Stack.Screen name="/perfil-comprador" component={BuyerProfileScreen} />
      <Stack.Screen name="/terminos" component={TermsRoute} />
      <Stack.Screen name="/privacidad" component={PrivacyRoute} />
      <Stack.Screen name="/dashboard">{() => withOperationalScreen(<DashboardScreen />)}</Stack.Screen>
      <Stack.Screen name="/mapa">{() => withOperationalScreen(<MapScreen />)}</Stack.Screen>
      <Stack.Screen name="/incidencias">{() => withOperationalScreen(<IncidentsScreen />)}</Stack.Screen>
      <Stack.Screen name="/usuarios">{() => withOperationalScreen(<UsersScreen />)}</Stack.Screen>
      <Stack.Screen name="/chat">{() => withOperationalScreen(<ChatScreen />)}</Stack.Screen>
      <Stack.Screen name="/radio">{() => withOperationalScreen(<RadioScreen />)}</Stack.Screen>
      <Stack.Screen name="/checklist">{() => withOperationalScreen(<ChecklistScreen />)}</Stack.Screen>
      <Stack.Screen name="/perfil">{() => withOperationalScreen(<ProfileScreen />)}</Stack.Screen>
      <Stack.Screen name="/perfil-editar">{() => withOperationalScreen(<ProfileEditScreen />)}</Stack.Screen>
      <Stack.Screen
        name="/modal"
        component={ModalScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  const { navigationTheme, theme } = useAppTheme();
  const splashHiddenRef = useRef(false);
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const { handlePushIntent, initialize, isHydrated, isBootstrapping, user } = useAppStore(
    useShallow((state) => ({
      handlePushIntent: state.handlePushIntent,
      initialize: state.initialize,
      isHydrated: state.isHydrated,
      isBootstrapping: state.isBootstrapping,
      user: state.user,
    }))
  );

  const hideSplash = useCallback(() => {
    splashHiddenRef.current = true;
  }, []);
  const isReady = isHydrated && !isBootstrapping;
  const styles = useMemo(() => createStyles(theme), [theme]);

  const retryBootstrap = useCallback(() => {
    setBootTimedOut(false);
    initialize().catch((error) => {
      console.error('[mobile:bootstrap:retry]', error);
      setBootTimedOut(true);
    });
  }, [initialize]);

  const resetBootstrapSession = useCallback(() => {
    setBootTimedOut(false);
    useAppStore
      .getState()
      .signOut()
      .finally(() => {
        router.replace('/login');
      });
  }, []);

  const continueWithoutLocation = useCallback(() => {
    if (!user) {
      return;
    }

    setBootTimedOut(false);
    useAppStore.setState({
      isHydrated: true,
      isBootstrapping: false,
      error: 'Ubicacion pendiente. Puedes continuar y reintentar GPS desde el mapa.',
    });
    router.replace(getAuthenticatedHome(user));
  }, [user]);

  useEffect(() => {
    initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (isReady) {
      hideSplash();
      setBootTimedOut(false);
    }
  }, [hideSplash, isReady]);

  useEffect(() => {
    if (isReady) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setBootTimedOut(true);
      hideSplash();
    }, BOOT_SYNC_TIMEOUT_MS);

    return () => clearTimeout(timeout);
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

      if (isCustomerAccount(user)) {
        router.push('/portal');
        return;
      }

      router.push('/perfil');
    });
  }, [handlePushIntent, user]);

  return (
    <GestureHandlerRootView
      onLayout={() => {
        if (isReady) {
          hideSplash();
        }
      }}
      style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <ThemeProvider value={navigationTheme}>
            <MobileErrorBoundary styles={styles} theme={theme}>
              {!isReady ? (
                bootTimedOut ? (
                  <RecoverableAppState
                    title="No pudimos sincronizar"
                    message="La sesion tardo demasiado en cargar. Reintenta la sincronizacion o inicia sesion de nuevo."
                    continueLabel="Continuar sin ubicacion"
                    onContinue={user ? continueWithoutLocation : undefined}
                    onRetry={retryBootstrap}
                    onResetSession={resetBootstrapSession}
                    styles={styles}
                    theme={theme}
                  />
                ) : (
                  <View style={styles.loader}>
                    <ActivityIndicator size="large" color={theme.colors.accent} />
                    <Text style={[styles.loaderText, { color: theme.colors.text }]}>
                      Sincronizando centro de control...
                    </Text>
                  </View>
                )
              ) : (
                <AppStack />
              )}
            </MobileErrorBoundary>
            <StatusBar style={theme.statusBar} backgroundColor={theme.colors.background} />
          </ThemeProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    container: {
      flex: 1,
    },
    loader: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: AppTheme.spacing.md,
      paddingHorizontal: AppTheme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    loaderText: {
      color: AppTheme.colors.text,
      fontFamily: Typography.body,
      fontSize: 15,
    },
    recoveryScreen: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingHorizontal: AppTheme.spacing.xl,
      backgroundColor: theme.colors.background,
    },
    recoveryMark: {
      width: 58,
      height: 58,
      borderRadius: 18,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    recoveryMarkText: {
      fontFamily: Typography.display,
      fontSize: 30,
      fontWeight: '900',
    },
    recoveryTitle: {
      fontFamily: Typography.display,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
    },
    recoveryMessage: {
      maxWidth: 420,
      fontFamily: Typography.body,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
    },
    recoveryButtonGroup: {
      width: '100%',
      maxWidth: 320,
      gap: 10,
      marginTop: 8,
    },
    recoveryPrimaryButton: {
      minHeight: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    recoveryPrimaryText: {
      color: '#FFFFFF',
      fontFamily: Typography.body,
      fontSize: 15,
      fontWeight: '800',
    },
    recoverySecondaryButton: {
      minHeight: 46,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    recoverySecondaryText: {
      fontFamily: Typography.body,
      fontSize: 14,
      fontWeight: '700',
    },
    recoveryPressed: {
      opacity: 0.86,
    },
  });
}
