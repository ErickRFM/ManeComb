import { lazy, Suspense, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, RouterProvider, router, usePathname } from '@/components/router';
import { Typography } from '@/styles/theme';
import { useAdminStore } from '@/features/auth/store';
import { ScreenErrorBoundary } from '@/components/screen-error-boundary';

const AdminLoginScreen = lazy(() => import('@/features/auth/screens/login-screen').then((m) => ({ default: m.AdminLoginScreen })));
const AdminMfaSetupScreen = lazy(() => import('@/features/auth/screens/mfa-setup-screen').then((m) => ({ default: m.AdminMfaSetupScreen })));
const AdminMfaVerifyScreen = lazy(() => import('@/features/auth/screens/mfa-verify-screen').then((m) => ({ default: m.AdminMfaVerifyScreen })));
const AdminPlaceholderScreen = lazy(() => import('@/features/auth/screens/placeholder-screen').then((m) => ({ default: m.AdminPlaceholderScreen })));

function BootScreen() {
  return (
    <View style={styles.bootScreen}>
      <Text style={styles.bootTitle}>ManeComb</Text>
      <Text style={styles.bootText}>Admin Global</Text>
    </View>
  );
}

function Routes() {
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  const bootstrap = useAdminStore((s) => s.bootstrap);
  const isBootstrapping = useAdminStore((s) => s.isBootstrapping);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  if (isBootstrapping) return <BootScreen />;

  switch (pathname) {
    case '/':
    case '/admin/login':
      return <ScreenErrorBoundary name="Admin Login"><AdminLoginScreen /></ScreenErrorBoundary>;
    case '/admin/mfa/setup':
      return <ScreenErrorBoundary name="Admin MFA Setup"><AdminMfaSetupScreen /></ScreenErrorBoundary>;
    case '/admin/mfa':
      return <ScreenErrorBoundary name="Admin MFA Verify"><AdminMfaVerifyScreen /></ScreenErrorBoundary>;
    case '/admin':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Placeholder"><AdminPlaceholderScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    default:
      return <Redirect href="/admin/login" />;
  }
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const mode = useAdminStore((s) => s.mode);
  if (mode !== 'authenticated') return <Redirect href="/admin/login" />;
  return <>{children}</>;
}

export function App() {
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
});
