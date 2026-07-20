import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, ThemeProvider } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { useShallow } from 'zustand/react/shallow';
import { AppTheme, Typography } from '@/constants/theme';
import { CustomerAuthScreen } from '@/src/screens/customer-auth-screen';
import { ChecklistScreen } from '@/src/screens/checklist-screen';
import { ChatScreen } from '@/src/screens/chat-screen';
import { IncidentsScreen } from '@/src/screens/incidents-screen';
import { LegalScreen } from '@/src/screens/legal-screen';
import { MapScreen } from '@/src/screens/map-screen';
import { BrandSyncLoader } from '@/src/components/brand-sync-loader';
import { MobileAccountGateScreen } from '@/src/screens/mobile-account-gate-screen';
import { ProfileEditScreen } from '@/src/screens/profile-edit-screen';
import { ProfileScreen } from '@/src/screens/profile-screen';
import { RadioScreen } from '@/src/screens/radio-screen';
import { UsersScreen } from '@/src/screens/users-screen';
import { useAppTheme } from '@/src/hooks/use-app-theme';
import { API_URL } from '@/src/api/client';
import * as Location from '@/src/native/location';
import {
  startBackgroundLocationServiceAsync,
  stopBackgroundLocationServiceAsync,
} from '@/src/native/background-location';
import { navigationRef, Redirect, router } from '@/src/navigation/router';
import { MODULE_ROUTE_NAMES, canRoleAccessRoute } from '@/src/navigation/route-registry';
import { linking } from '@/src/navigation/linking';
import {
  LatestNavigationRequest,
  shouldReturnToMapOnAndroidBack,
} from '@/src/navigation/navigation-policy';
import { useAppStore } from '@/src/store/use-app-store';
import { useLocationEngine } from '@/src/screens/map/hooks/use-location-engine';
import { useLocationSync } from '@/src/screens/map/hooks/use-location-sync';
import { useScheduleTick } from '@/src/screens/map/hooks/use-schedule-tick';
import { getAuthenticatedHome, getOperationalHome } from '@/src/utils/account-routing';
import { addPushResponseListener } from '@/src/utils/push-notifications';
import { openSalesPortal } from '@/src/utils/sales-portal';
import { StatusBar } from '@/src/native/status-bar';

const Stack = createNativeStackNavigator();
const MapStack = createNativeStackNavigator();
const IncidentsStack = createNativeStackNavigator();
const UsersStack = createNativeStackNavigator();
const ChatStack = createNativeStackNavigator();
const RadioStack = createNativeStackNavigator();
const ChecklistStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
// El backend corre en el tier gratuito de Render: un servicio dormido tarda
// 30-60s en despertar. El timeout de arranque debe cubrir ese caso (va alineado
// con COLD_START_SESSION_TIMEOUT_MS del cliente HTTP) para que un arranque en
// frio lento no se presente como un fallo de sincronizacion.
const BOOT_SYNC_TIMEOUT_MS = 80000;
// A partir de aqui avisamos que el servidor se esta despertando, sin salir aun
// del estado de carga.
const BOOT_SLOW_NOTICE_MS = 7000;

type AppStyles = ReturnType<typeof createStyles>;
type AppThemeValue = ReturnType<typeof useAppTheme>['theme'];

function OperationalBackgroundServices() {
  const location = useLocationEngine();
  const { activeRouteSession, authContext, connectionMode, refreshToken, sendVehicleLocation, token, user } = useAppStore(
    useShallow((state) => ({
      activeRouteSession: state.activeRouteSession,
      authContext: state.authContext,
      connectionMode: state.connectionMode,
      refreshToken: state.refreshToken,
      sendVehicleLocation: state.sendVehicleLocation,
      token: state.token,
      user: state.user,
    }))
  );
  const scheduleState = useScheduleTick(user?.operationalSchedule);

  useEffect(() => {
    useAppStore.setState({
      deviceLocation: {
        backgroundPermission: location.backgroundPermission,
        coordinates: location.coordinates,
        issue: location.issue,
        lastUpdatedAt: location.lastUpdatedAt,
        loading: location.loading,
        permission: location.permission,
        retryCount: location.retryCount,
        servicesEnabled: location.servicesEnabled,
      },
      refreshDeviceLocation: location.refresh,
    });
  }, [location.backgroundPermission, location.coordinates, location.issue, location.lastUpdatedAt, location.loading, location.permission, location.refresh, location.retryCount, location.servicesEnabled]);

  useLocationSync({
    enabled: Boolean(user?.vehicleId),
    connectionMode,
    coordinates: location.coordinates,
    isWithinSchedule: scheduleState.isWithinSchedule,
    lastUpdatedAt: location.lastUpdatedAt,
    sendVehicleLocation,
    vehicleId: user?.vehicleId,
  });

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    let cancelled = false;
    const syncService = async () => {
      const canTryStart =
        Boolean(token && user?.vehicleId) &&
        authContext?.canAccessMobile === true;

      if (!canTryStart) {
        await stopBackgroundLocationServiceAsync().catch(() => undefined);
        return;
      }

      const isDriver = user?.role === 'driver';
      const hasActiveSession = activeRouteSession?.status === 'RUNNING';
      if (isDriver && !hasActiveSession) {
        await stopBackgroundLocationServiceAsync().catch(() => undefined);
        return;
      }

      const [foreground, background] = await Promise.all([
        Location.getForegroundPermissionsAsync().catch(() => ({ status: Location.PermissionStatus.DENIED })),
        Location.requestBackgroundPermissionsAsync().catch(() => ({ status: Location.PermissionStatus.DENIED })),
      ]);

      if (
        cancelled ||
        foreground.status !== Location.PermissionStatus.GRANTED ||
        background.status !== Location.PermissionStatus.GRANTED
      ) {
        await stopBackgroundLocationServiceAsync().catch(() => undefined);
        return;
      }

      await startBackgroundLocationServiceAsync({
        apiUrl: API_URL,
        schedule: user?.operationalSchedule || null,
        token: token || '',
        refreshToken: refreshToken || '',
        vehicleId: user?.vehicleId || '',
        sessionId: activeRouteSession?.id || '',
      }).catch(() => undefined);
    };

    syncService();

    return () => {
      cancelled = true;
    };
  }, [
    activeRouteSession?.id,
    activeRouteSession?.status,
    authContext?.canAccessMobile,
    location.backgroundPermission,
    location.permission,
    token,
    refreshToken,
    user?.operationalSchedule,
    user?.role,
    user?.vehicleId,
  ]);

  useEffect(() => () => {
    stopBackgroundLocationServiceAsync().catch(() => undefined);
  }, []);

  return null;
}

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
  const { authContext, isHydrated, user } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
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

  const home = getAuthenticatedHome(user, authContext);

  if (home === '/mapa') {
    return <MapScreen />;
  }

  return <Redirect href={home} />;
}

function OperationalRoute({ children }: { children: React.ReactNode }) {
  const { authContext, user } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
      user: state.user,
    }))
  );

  if (!user) {
    return <Redirect href="/login" />;
  }

  const operationalHome = getOperationalHome(user, authContext);

  if (operationalHome !== '/mapa') {
    return <Redirect href={operationalHome} />;
  }

  return <>{children}</>;
}

function ApplicationRoute() {
  const { authContext, user } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
      user: state.user,
    }))
  );
  return <Redirect href={user ? getOperationalHome(user, authContext) : '/login'} />;
}

function CommercialRoute() {
  useEffect(() => {
    openSalesPortal().catch(() => undefined);
  }, []);

  return <MobileAccountGateScreen mode="blocked" />;
}

function NativeSalesRoute() {
  useEffect(() => {
    openSalesPortal().catch(() => undefined);
  }, []);

  return <Redirect href="/login" />;
}

function PlanBlockedRoute() {
  return <MobileAccountGateScreen mode="blocked" />;
}

function OperationalOnboardingRoute() {
  return <MobileAccountGateScreen mode="onboarding" />;
}

function SyncErrorRoute() {
  return <MobileAccountGateScreen mode="sync" />;
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

function withOperationalScreen(component: React.ReactNode) {
  return <OperationalRoute>{component}</OperationalRoute>;
}

function RoleProtectedOperationalRoute({ children, route }: { children: React.ReactNode; route: '/usuarios' | '/checklist' }) {
  const user = useAppStore((state) => state.user);
  const allowed = Boolean(user && canRoleAccessRoute(route, user.role));

  useEffect(() => {
    if (user && !allowed) {
      console.warn('[mobile:access] modulo operativo bloqueado', {
        role: user.role,
        route,
        userId: user.id,
      });
    }
  }, [allowed, route, user]);

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!allowed) {
    return <Redirect href="/mapa" />;
  }

  return <OperationalRoute>{children}</OperationalRoute>;
}

function DirectoryRoute({ children }: { children: React.ReactNode }) {
  return <RoleProtectedOperationalRoute route="/usuarios">{children}</RoleProtectedOperationalRoute>;
}

function ControlRoute({ children }: { children: React.ReactNode }) {
  return <RoleProtectedOperationalRoute route="/checklist">{children}</RoleProtectedOperationalRoute>;
}

const moduleScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: AppTheme.colors.background },
};

function MapModule() {
  return (
    <MapStack.Navigator initialRouteName="/mapa" screenOptions={moduleScreenOptions}>
      <MapStack.Screen name="/mapa">{() => withOperationalScreen(<MapScreen />)}</MapStack.Screen>
    </MapStack.Navigator>
  );
}

function IncidentsModule() {
  return (
    <IncidentsStack.Navigator initialRouteName="/incidencias" screenOptions={moduleScreenOptions}>
      <IncidentsStack.Screen name="/incidencias">
        {() => withOperationalScreen(<IncidentsScreen />)}
      </IncidentsStack.Screen>
    </IncidentsStack.Navigator>
  );
}

function UsersModule() {
  return (
    <UsersStack.Navigator initialRouteName="/usuarios" screenOptions={moduleScreenOptions}>
      <UsersStack.Screen name="/usuarios">{() => <DirectoryRoute><UsersScreen /></DirectoryRoute>}</UsersStack.Screen>
    </UsersStack.Navigator>
  );
}

function ChatModule() {
  return (
    <ChatStack.Navigator initialRouteName="/chat" screenOptions={moduleScreenOptions}>
      <ChatStack.Screen name="/chat">{() => withOperationalScreen(<ChatScreen />)}</ChatStack.Screen>
    </ChatStack.Navigator>
  );
}

function RadioModule() {
  return (
    <RadioStack.Navigator initialRouteName="/radio" screenOptions={moduleScreenOptions}>
      <RadioStack.Screen name="/radio">{() => withOperationalScreen(<RadioScreen />)}</RadioStack.Screen>
    </RadioStack.Navigator>
  );
}

function ChecklistModule() {
  return (
    <ChecklistStack.Navigator initialRouteName="/checklist" screenOptions={moduleScreenOptions}>
      <ChecklistStack.Screen name="/checklist">
        {() => <ControlRoute><ChecklistScreen /></ControlRoute>}
      </ChecklistStack.Screen>
    </ChecklistStack.Navigator>
  );
}

function ProfileModule() {
  return (
    <ProfileStack.Navigator initialRouteName="/perfil" screenOptions={moduleScreenOptions}>
      <ProfileStack.Screen name="/perfil">{() => withOperationalScreen(<ProfileScreen />)}</ProfileStack.Screen>
      <ProfileStack.Screen name="/perfil-editar">
        {() => withOperationalScreen(<ProfileEditScreen />)}
      </ProfileStack.Screen>
    </ProfileStack.Navigator>
  );
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
      <Stack.Screen name="/ventas/login" component={NativeSalesRoute} />
      <Stack.Screen name="/ventas/registro" component={NativeSalesRoute} />
      <Stack.Screen name="/plan-blocked" component={PlanBlockedRoute} />
      <Stack.Screen name="/operational-onboarding" component={OperationalOnboardingRoute} />
      <Stack.Screen name="/sync-error" component={SyncErrorRoute} />
      <Stack.Screen name="/portal" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/plan" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/usuarios" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/pagos" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/facturacion" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/perfil" component={PlanBlockedRoute} />
      <Stack.Screen name="/portal/onboarding" component={OperationalOnboardingRoute} />
      <Stack.Screen name="/portal/comercial" component={PlanBlockedRoute} />
      <Stack.Screen name="/perfil-comprador" component={PlanBlockedRoute} />
      <Stack.Screen name="/terminos" component={TermsRoute} />
      <Stack.Screen name="/privacidad" component={PrivacyRoute} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.map} component={MapModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.incidents} component={IncidentsModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.users} component={UsersModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.chat} component={ChatModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.radio} component={RadioModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.checklist} component={ChecklistModule} />
      <Stack.Screen name={MODULE_ROUTE_NAMES.profile} component={ProfileModule} />
    </Stack.Navigator>
  );
}

export default function App() {
  const { navigationTheme, theme } = useAppTheme();
  const splashHiddenRef = useRef(false);
  const pushNavigationRequestRef = useRef(new LatestNavigationRequest());
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [bootIsSlow, setBootIsSlow] = useState(false);
  const { authContext, handlePushIntent, initialize, isHydrated, isBootstrapping, user } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
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
    router.replace(getAuthenticatedHome(user, authContext));
  }, [authContext, user]);

  useEffect(() => {
    initialize().catch(() => undefined);
  }, [initialize]);

  useEffect(() => {
    if (isReady) {
      hideSplash();
      setBootTimedOut(false);
      setBootIsSlow(false);
    }
  }, [hideSplash, isReady]);

  useEffect(() => {
    if (isReady) {
      return undefined;
    }

    // Mientras la sincronizacion sigue en curso mostramos carga, no error: solo
    // al agotarse el timeout generoso pasamos al estado recuperable.
    const slowNotice = setTimeout(() => setBootIsSlow(true), BOOT_SLOW_NOTICE_MS);
    const timeout = setTimeout(() => {
      setBootTimedOut(true);
      hideSplash();
    }, BOOT_SYNC_TIMEOUT_MS);

    return () => {
      clearTimeout(slowNotice);
      clearTimeout(timeout);
    };
  }, [hideSplash, isReady]);

  // La splash nativa se oculta pronto para dar paso al loader de marca, que es
  // quien comunica el progreso real de la sincronizacion.
  useEffect(() => {
    const timeout = setTimeout(hideSplash, 2500);
    return () => clearTimeout(timeout);
  }, [hideSplash]);

  useEffect(() => {
    return addPushResponseListener(async (intent) => {
      const sequence = pushNavigationRequestRef.current.begin();

      if (!user) {
        router.replace('/login');
        return;
      }

      await handlePushIntent(intent);

      if (!pushNavigationRequestRef.current.isLatest(sequence)) {
        return;
      }

      router.clearPendingNavigation();

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

      router.push(getAuthenticatedHome(user, authContext) === '/mapa' ? '/perfil' : getAuthenticatedHome(user, authContext));
    });
  }, [authContext, handlePushIntent, user]);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const currentRoute = navigationRef.getCurrentRoute()?.name;

      if (shouldReturnToMapOnAndroidBack(currentRoute)) {
        router.replace('/mapa');
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView
      onLayout={() => {
        if (isReady) {
          hideSplash();
        }
      }}
      style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <KeyboardProvider preload={false}>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef} theme={navigationTheme} linking={linking}>
          <ThemeProvider value={navigationTheme}>
            {isReady && user && authContext?.canAccessMobile ? <OperationalBackgroundServices /> : null}
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
                  <BrandSyncLoader stage={bootIsSlow ? 'slow' : 'loading'} />
                )
              ) : (
                <AppStack />
              )}
            </MobileErrorBoundary>
            <StatusBar style={theme.statusBar} backgroundColor={theme.colors.background} />
          </ThemeProvider>
          </NavigationContainer>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

function createStyles(theme: ReturnType<typeof useAppTheme>['theme']) {
  return StyleSheet.create({
    container: {
      flex: 1,
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
