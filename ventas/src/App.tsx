import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RouterProvider, router, usePathname } from '@/src/navigation/router';
import { useAppStore } from '@/src/store/use-app-store';
import { SalesAuthScreen } from '@/screens/sales-auth-screen';
import { PlanCheckoutScreen } from '@/screens/plan-checkout-screen';
import { SalesScreen } from '@/screens/sales-screen';
import { PortalBillingScreen } from '@/features/portal/screens/portal-billing-screen';
import { PortalDashboardScreen } from '@/features/portal/screens/portal-dashboard-screen';
import { PortalOnboardingScreen } from '@/features/portal/screens/portal-onboarding-screen';
import { PortalPaymentsScreen } from '@/features/portal/screens/portal-payments-screen';
import { PortalPlanScreen } from '@/features/portal/screens/portal-plan-screen';
import { PortalProfileScreen } from '@/features/portal/screens/portal-profile-screen';
import { PortalUsersScreen } from '@/features/portal/screens/portal-users-screen';
import { Typography } from '@/constants/theme';

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
      <Text style={styles.staticLink} onPress={() => router.push('/ventas')}>
        Volver a ventas
      </Text>
    </View>
  );
}

function OperationalPlaceholder({ title }: { title: string }) {
  return (
    <StaticPage
      title={title}
      body="Esta ruta pertenece al panel operativo de ManeComb. El despliegue web de ventas conserva el acceso, pero no incluye la app movil ni las pantallas operativas."
    />
  );
}

function Routes() {
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  const isHydrated = useAppStore((state) => state.isHydrated);
  const isBootstrapping = useAppStore((state) => state.isBootstrapping);

  if (!isHydrated && isBootstrapping) {
    return <BootScreen />;
  }

  switch (pathname) {
    case '/':
    case '/ventas':
      return <SalesScreen />;
    case '/ventas/login':
      return <SalesAuthScreen mode="login" />;
    case '/ventas/registro':
      return <SalesAuthScreen mode="register" />;
    case '/ventas/pago':
      return <PlanCheckoutScreen />;
    case '/portal':
      return <PortalDashboardScreen />;
    case '/portal/usuarios':
    case '/usuarios':
      return <PortalUsersScreen />;
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
      return <StaticPage title="Terminos" body="Documento legal pendiente de publicar para el sitio de ventas." />;
    case '/privacidad':
      return <StaticPage title="Privacidad" body="Aviso de privacidad pendiente de publicar para el sitio de ventas." />;
    default:
      return <StaticPage title="Pagina no encontrada" body="La ruta solicitada no existe en el portal de ventas." />;
  }
}

export function App() {
  const initialize = useAppStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <RouterProvider>
      <Routes />
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
