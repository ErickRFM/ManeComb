import { lazy, Suspense, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RouterProvider, router, usePathname } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';
import { Typography } from '@/constants/theme';
import { hasPortalPermission, type PortalPermission } from '@/features/portal/utils/access';

const SalesScreen = lazy(() => import('@/screens/sales-screen').then((module) => ({ default: module.SalesScreen })));
const SalesAuthScreen = lazy(() => import('@/screens/sales-auth-screen').then((module) => ({ default: module.SalesAuthScreen })));
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

function BootScreen() {
  return (
    <View style={styles.bootScreen}>
      <Text style={styles.bootTitle}>ManeComb</Text>
      <Text style={styles.bootText}>Preparando portal de ventas...</Text>
    </View>
  );
}

function StaticPage({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.staticPage}>
      <Text style={styles.staticTitle}>{title}</Text>
      <Text style={styles.staticBody}>{body}</Text>
      <Pressable accessibilityRole="button" onPress={() => router.push('/ventas')}>
        <Text style={styles.staticLink}>Volver a ventas</Text>
      </Pressable>
    </View>
  );
}

function OperationalPlaceholder({ title }: { title: string }) {
  return (
    <StaticPage
      title={title}
      body="Esta ruta pertenece al panel operativo de ManeComb. El despliegue web de ventas conserva el acceso, pero no incluye la app móvil ni las pantallas operativas."
    />
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
  };
  const requiredPermission = protectedPortalRoutes[pathname];
  if (requiredPermission && !hasPortalPermission(user, requiredPermission)) {
    return <PortalDashboardScreen />;
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
    case '/ventas/pago':
      return <PlanCheckoutScreen />;
    case '/portal':
      return <PortalDashboardScreen />;
    case '/portal/usuarios':
      return <PortalUsersScreen />;
    case '/portal/unidades':
      return <PortalUnitsScreen />;
    case '/portal/rutas':
      return <PortalRoutesScreen />;
    case '/portal/plan':
      return <PortalPlanScreen />;
    case '/portal/facturacion':
      return <PortalBillingScreen />;
    case '/portal/pagos':
      return <PortalPaymentsScreen />;
    case '/portal/perfil':
      return <PortalProfileScreen />;
    case '/portal/onboarding':
      return <PortalOnboardingScreen />;
    case '/mapa':
      return <OperationalPlaceholder title="Panel operativo" />;
    case '/radio':
      return <OperationalPlaceholder title="Radio operativo" />;
    case '/terminos':
      return <StaticPage title="Términos" body="Condiciones de uso, soporte comercial y acceso al servicio ManeComb." />;
    case '/privacidad':
      return <StaticPage title="Privacidad" body="Información de privacidad y canales de contacto para cuentas ManeComb." />;
    default:
      return <StaticPage title="Página no encontrada" body="La ruta solicitada no existe en el portal de ventas." />;
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
});
