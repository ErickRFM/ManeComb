import { lazy, Suspense, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, RouterProvider, router, usePathname } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';
import { Typography } from '@/constants/theme';
import {
  canAccessPortal,
  hasPortalPermission,
  type PortalPermission,
} from '@/features/portal/utils/access';
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
    <View style={styles.bootScreen}>
      <Text style={styles.bootTitle}>ManeComb</Text>
      <Text style={styles.bootText}>Preparando Ventas y Portal...</Text>
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
          Esta cuenta pertenece a Mobile. Abre la app ManeComb en tu teléfono para usar mapa, GPS, rutas, Radio, Chat y llamadas.
        </Text>
        <Text style={styles.operationalMeta}>
          Rol: {role} · Tipo: {accountType} · Canal: {accountChannel}
        </Text>
        <Text style={styles.operationalHint}>
          Ventas permite conocer y contratar planes. El Portal web es exclusivo de cuentas company_portal. Esta cuenta mobile_operations no puede entrar al Portal empresarial.
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
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);
  const user = useAppStore((state) => state.user);

  if (!isHydrated && isBootstrapping) {
    return <BootScreen />;
  }

  const protectedPortalRoutes: Partial<Record<string, PortalPermission>> = {
    '/portal/usuarios': 'users',
    '/portal/unidades': 'vehicles',
    '/portal/rutas': 'routes',
    '/portal/plan': 'billing',
    '/portal/facturacion': 'billing',
    '/portal/pagos': 'billing',
    '/portal/documentos': 'billing',
    '/portal/incidencias': 'billing',
  };
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

  if (isOperationalNoticeRoute && getAccountChannel(user) !== 'mobile_operations') {
    return <Redirect href={getAuthenticatedHome(user) as never} />;
  }

  const requiredPermission = protectedPortalRoutes[pathname];
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
      return <ScreenErrorBoundary name="Operaciones"><PortalDashboardScreen /></ScreenErrorBoundary>;
    case '/portal/usuarios':
      return <ScreenErrorBoundary name="Equipo"><PortalUsersScreen /></ScreenErrorBoundary>;
    case '/portal/unidades':
      return <ScreenErrorBoundary name="Unidades"><PortalUnitsScreen /></ScreenErrorBoundary>;
    case '/portal/rutas':
      return <ScreenErrorBoundary name="Rutas"><PortalRoutesScreen /></ScreenErrorBoundary>;
    case '/portal/plan':
      return <ScreenErrorBoundary name="Plan"><PortalPlanScreen /></ScreenErrorBoundary>;
    case '/portal/facturacion':
      return <ScreenErrorBoundary name="Facturación"><PortalBillingScreen /></ScreenErrorBoundary>;
    case '/portal/pagos':
      return <ScreenErrorBoundary name="Pagos"><PortalPaymentsScreen /></ScreenErrorBoundary>;
    case '/portal/perfil':
      return <ScreenErrorBoundary name="Perfil"><PortalProfileScreen /></ScreenErrorBoundary>;
    case '/portal/onboarding':
      return <ScreenErrorBoundary name="Activación"><PortalOnboardingScreen /></ScreenErrorBoundary>;
    case '/portal/documentos':
      return <ScreenErrorBoundary name="Documentos"><PortalDocumentsScreen /></ScreenErrorBoundary>;
    case '/portal/incidencias':
      return <ScreenErrorBoundary name="Incidencias"><PortalIncidentsScreen /></ScreenErrorBoundary>;
    case '/portal/app-movil':
      return <ScreenErrorBoundary name="App Móvil"><PortalAppMovilScreen /></ScreenErrorBoundary>;
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
  bootText: {
    color: '#A8B1C2',
    fontFamily: Typography.body,
    fontSize: 14,
    marginTop: 8,
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
