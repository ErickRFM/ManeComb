import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
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

  return <Redirect href={getAuthenticatedHome(user)} />;
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
            {!isReady ? (
              <View style={styles.loader}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
                <Text style={[styles.loaderText, { color: theme.colors.text }]}>
                  Sincronizando centro de control...
                </Text>
              </View>
            ) : (
              <AppStack />
            )}
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
  });
}
