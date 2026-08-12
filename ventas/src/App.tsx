import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useShallow } from 'zustand/react/shallow';
import { Redirect, RouterProvider, router, usePathname } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import { Typography } from '@/constants/theme';
import {
  canAccessPortal,
  hasPortalPermission,
} from '@/features/portal/utils/access';
import { getPortalRoutePermission } from '@/features/portal/navigation/portal-route-registry';
import { isPortalRouteAllowedBySubscription } from '@/features/portal/navigation/portal-subscription-access';
import {
  getAccountChannel,
  getAuthenticatedHome,
} from '@/src/utils/account-routing';
import { ScreenErrorBoundary } from '@/src/components/screen-error-boundary';

const SalesScreen = lazy(() => import('@/screens/sales-screen').then((module) => ({ default: module.SalesScreen })));
const SalesAuthScreen = lazy(() => import('@/screens/sales-auth-screen').then((module) => ({ default: module.SalesAuthScreen })));
const PasswordResetScreen = lazy(() => import('@/screens/password-reset-screen').then((module) => ({ default: module.PasswordResetScreen })));
const PasswordRecoveryRequestScreen = lazy(() => import('@/screens/password-recovery/password-recovery-request-screen').then((module) => ({ default: module.PasswordRecoveryRequestScreen })));
const PasswordRecoverySentScreen = lazy(() => import('@/screens/password-recovery/password-recovery-sent-screen').then((module) => ({ default: module.PasswordRecoverySentScreen })));
const PasswordUpdatedScreen = lazy(() => import('@/screens/password-recovery/password-updated-screen').then((module) => ({ default: module.PasswordUpdatedScreen })));
const PlanCheckoutScreen = lazy(() => import('@/screens/plan-checkout-screen').then((module) => ({ default: module.PlanCheckoutScreen })));
const PortalBillingScreen = lazy(() => import('@/features/portal/screens/portal-billing-screen').then((module) => ({ default: module.PortalBillingScreen })));
const PortalDashboardScreen = lazy(() => import('@/features/portal/screens/portal-dashboard-screen').then((module) => ({ default: module.PortalDashboardScreen })));
const PortalOnboardingScreen = lazy(() => import('@/features/portal/screens/portal-onboarding-screen').then((module) => ({ default: module.PortalOnboardingScreen })));
const PortalPaymentsScreen = lazy(() => import('@/features/portal/screens/portal-payments-screen').then((module) => ({ default: module.PortalPaymentsScreen })));
const PortalPlanScreen = lazy(() => import('@/features/portal/screens/portal-plan-screen').then((module) => ({ default: module.PortalPlanScreen })));
const PortalProfileScreen = lazy(() => import('@/features/portal/screens/portal-profile-screen').then((module) => ({ default: module.PortalProfileScreen })));
const PortalRoutesScreen = lazy(() => import('@/features/portal/screens/portal-routes-screen').then((module) => ({ default: module.PortalRoutesScreen })));
const PortalUnitsScreen = lazy(() => import('@/features/portal/screens/portal-units-screen').then((module) => ({ default: module.PortalUnitsScreen })));
const PortalUsersScreen = lazy(() => import('@/features/portal/screens/portal-users-screen').then((module) => ({ default: module.PortalUsersScreen })));
const PortalDocumentsScreen = lazy(() => import('@/features/portal/screens/portal-documents-screen').then((module) => ({ default: module.PortalDocumentsScreen })));
const PortalIncidentsScreen = lazy(() => import('@/features/portal/screens/portal-incidents-screen').then((module) => ({ default: module.PortalIncidentsScreen })));
const PortalAppMovilScreen = lazy(() => import('@/features/portal/screens/portal-app-movil-screen').then((module) => ({ default: module.PortalAppMovilScreen })));

function BootScreen() {
  return (
    <View style={styles.bootScreen} accessibilityRole="progressbar" accessibilityLabel="Cargando ManeComb">
      <Text style={styles.bootTitle}>ManeComb</Text>
      <ActivityIndicator size="small" color="#FF4D7D" style={styles.bootIndicator} />
      <Text style={styles.bootText}>Sincronizando sesión y permisos...</Text>
    </View>
  );
}

function StaticPage({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.staticPage}>
      <Text style={styles.staticTitle}>{title}</Text>
      <Text style={styles.staticBody}>{body}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/ventas')}>
        <Text style={styles.staticLink}>Volver a Ventas</Text>
      </Pressable>
    </View>
  );
}

/**
 * Única autoridad de acceso por estado de suscripción para rutas del Portal.
 * La policy compartida decide qué rutas siguen disponibles sin plan; el layout
 * únicamente proyecta esa misma policy en el menú.
 */
function OperationalPortalGate({ children }: { children: ReactNode }) {
  const pathname = usePathname().replace(/\/+$/, '') || '/portal';
  const { error, isLoading, loadOverview, overview, subscription } = usePortalStore(
    useShallow((state) => ({
      error: state.error,
      isLoading: state.isLoading,
      loadOverview: state.loadOverview,
      overview: state.overview,
      subscription: state.subscription,
    }))
  );
  const resolvedSubscription = subscription || overview?.subscription || null;
  const authorityReady = Boolean(subscription || overview || error);

  useEffect(() => {
    if (!authorityReady && !isLoading) {
      void loadOverview();
    }
  }, [authorityReady, isLoading, loadOverview]);

  if (!authorityReady) {
    return <BootScreen />;
  }

  if (!isPortalRouteAllowedBySubscription(pathname, resolvedSubscription, true)) {
    return <Redirect href="/portal/plan" />;
  }

  return <>{children}</>;
}

function OperationalAccountNotice() {
  const user = useAppStore((state) => state.user);
  const signOut = useAppStore((state) => state.signOut);
  const role = user?.role || 'sin definir';
  const accountType = user?.accountType || 'sin definir';
  const accountChannel = getAccountChannel(user);

  const handleSignOut = async () => {
    await signOut();
    router.replace('/ventas/login');
  };

  return (
    <View style={styles.staticPage}>
      <View style={styles.operationalPanel}>
        <Text style={styles.operationalBadge}>CUENTA OPERATIVA</Text>
        <Text style={styles.staticTitle}>Continúa en la app móvil</Text>
        <Text style={styles.staticBody}>
          Esta identidad tiene acceso a la operación móvil de ManeComb. Abre la app en tu teléfono para usar mapa, GPS, rutas, Radio, Chat y llamadas.
        </Text>
        <Text style={styles.operationalMeta}>
          Rol: {role} · Tipo: {accountType} · Canal principal: {accountChannel}
        </Text>
        <Text style={styles.operationalHint}>
          El canal principal orienta el destino inicial; los permisos de la cuenta determinan los productos y funciones disponibles. Esta identidad no tiene acceso autorizado al Portal empresarial.
        </Text>
        <View style={styles.operationalActions}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/ventas')} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Ir a Ventas</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => void handleSignOut()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Routes() {
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  const isHydrated = useAppStore((state) => state.isHydrated);
  const user = useAppStore((state) => state.user);

  // Never resolve protected routing before session hydration is complete. This
  // avoids transient redirects and blank/incorrect states if bootstrap flags drift.
  if (!isHydrated) {
    return <BootScreen />;
  }

  const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/');
  const isOperationalNoticeRoute = pathname === '/acceso-operativo';

  if (isPortalRoute && !user) {
    return <Redirect href="/ventas/login" />;
  }

  if (isPortalRoute && !canAccessPortal(user)) {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
  }

  if (isOperationalNoticeRoute && !user) {
    return <Redirect href="/ventas/login" />;
  }

  if (
    isOperationalNoticeRoute &&
    (getAccountChannel(user) !== 'mobile_operations' || canAccessPortal(user))
  ) {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
  }

  const requiredPermission = getPortalRoutePermission(pathname);
  if (requiredPermission && !hasPortalPermission(user, requiredPermission)) {
    return <Redirect href="/portal" />;
  }

  switch (pathname) {
    case '/':
    case '/ventas':
      return <SalesScreen />;
    case '/login':
    case '/ventas/login':
      return <SalesAuthScreen mode="login" />;
    case '/registro':
    case '/ventas/registro':
      return <SalesAuthScreen mode="register" />;
    case '/reset-password':
      return <PasswordResetScreen />;
    case '/ventas/recuperar-contrasena':
      return <PasswordRecoveryRequestScreen />;
    case '/ventas/recuperacion-enviada':
      return <PasswordRecoverySentScreen />;
    case '/ventas/contrasena-actualizada':
      return <PasswordUpdatedScreen />;
    case '/ventas/pago':
      return <PlanCheckoutScreen />;
    case '/portal':
      return <OperationalPortalGate><ScreenErrorBoundary name="Operaciones"><PortalDashboardScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/usuarios':
      return <OperationalPortalGate><ScreenErrorBoundary name="Equipo"><PortalUsersScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/unidades':
      return <OperationalPortalGate><ScreenErrorBoundary name="Unidades"><PortalUnitsScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/rutas':
      return <OperationalPortalGate><ScreenErrorBoundary name="Rutas"><PortalRoutesScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/plan':
      return <OperationalPortalGate><ScreenErrorBoundary name="Plan"><PortalPlanScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/facturacion':
      return <OperationalPortalGate><ScreenErrorBoundary name="Facturación"><PortalBillingScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/pagos':
      return <OperationalPortalGate><ScreenErrorBoundary name="Pagos"><PortalPaymentsScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/perfil':
      return <OperationalPortalGate><ScreenErrorBoundary name="Perfil"><PortalProfileScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/onboarding':
      return <OperationalPortalGate><ScreenErrorBoundary name="Activación"><PortalOnboardingScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/documentos':
      return <OperationalPortalGate><ScreenErrorBoundary name="Documentos"><PortalDocumentsScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/incidencias':
      return <OperationalPortalGate><ScreenErrorBoundary name="Incidencias"><PortalIncidentsScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/portal/app-movil':
      return <OperationalPortalGate><ScreenErrorBoundary name="App Móvil"><PortalAppMovilScreen /></ScreenErrorBoundary></OperationalPortalGate>;
    case '/acceso-operativo':
      return <OperationalAccountNotice />;
    case '/acceso-admin':
      return (
        <StaticPage
          title="Usa Admin Global"
          body="Esta identidad pertenece a la administración interna de ManeComb. No puede operar desde Ventas, el Portal de empresa ni Mobile."
        />
      );
    case '/acceso-restringido':
      return (
        <StaticPage
          title="Cuenta sin producto autorizado"
          body="El tipo de cuenta y el rol no forman una identidad válida de ManeComb. Cierra sesión y solicita al administrador que corrija la cuenta."
        />
      );
    case '/terminos':
      return <StaticPage title="Términos" body="Condiciones de uso, soporte comercial y acceso al servicio ManeComb." />;
    case '/privacidad':
      return <StaticPage title="Privacidad" body="Información de privacidad y canales de contacto para cuentas ManeComb." />;
    default:
      return <StaticPage title="Página no encontrada" body="La ruta solicitada no existe en Ventas ni en el Portal." />;
  }
}

export function App() {
  const initialize = useAppStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <RouterProvider>
      <Suspense fallback={<BootScreen />}>
        <Routes />
      </Suspense>
    </RouterProvider>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    alignItems: 'center',
    backgroundColor: '#050816',
    flex: 1,
    justifyContent: 'center',
    minHeight: '100vh' as any,
    padding: 24,
  },
  bootTitle: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 34,
    fontWeight: '900',
  },
  bootIndicator: {
    marginTop: 16,
  },
  bootText: {
    color: '#A8B1C2',
    fontFamily: Typography.body,
    fontSize: 14,
    marginTop: 10,
  },
  staticPage: {
    alignItems: 'flex-start',
    backgroundColor: '#050816',
    flex: 1,
    gap: 12,
    justifyContent: 'center',
    minHeight: '100vh' as any,
    padding: 28,
  },
  staticTitle: {
    color: '#F8FAFC',
    fontFamily: Typography.display,
    fontSize: 30,
    fontWeight: '900',
  },
  staticBody: {
    color: '#A8B1C2',
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 620,
  },
  staticLink: {
    color: '#FF4D7D',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 12,
  },
  operationalPanel: {
    alignSelf: 'center',
    backgroundColor: '#0B1020',
    borderColor: '#27324A',
    borderRadius: 22,
    borderWidth: 1,
    gap: 14,
    maxWidth: 720,
    padding: 28,
    width: '100%',
  },
  operationalBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#073B4C',
    borderColor: '#00C2FF',
    borderRadius: 999,
    borderWidth: 1,
    color: '#63D9FF',
    fontFamily: Typography.body,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  operationalMeta: {
    color: '#F8FAFC',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
  operationalHint: {
    color: '#7E8AA3',
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 640,
  },
  operationalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FF2D73',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#E2E8F0',
    fontFamily: Typography.body,
    fontSize: 14,
    fontWeight: '800',
  },
});