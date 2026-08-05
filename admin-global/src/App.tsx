import { lazy, Suspense, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, RouterProvider, usePathname } from '@/components/router';
import { Typography } from '@/styles/theme';
import { useAdminStore } from '@/features/auth/store';
import { ScreenErrorBoundary } from '@/components/screen-error-boundary';
import { findAdminNavigationItem } from '@/features/platform/navigation';

const AdminLoginScreen = lazy(() => import('@/features/auth/screens/login-screen').then((module) => ({ default: module.AdminLoginScreen })));
const AdminMfaSetupScreen = lazy(() => import('@/features/auth/screens/mfa-setup-screen').then((module) => ({ default: module.AdminMfaSetupScreen })));
const AdminMfaVerifyScreen = lazy(() => import('@/features/auth/screens/mfa-verify-screen').then((module) => ({ default: module.AdminMfaVerifyScreen })));
const AdminOverviewScreen = lazy(() => import('@/features/platform/screens/overview-screen').then((module) => ({ default: module.AdminOverviewScreen })));
const AdminCompaniesScreen = lazy(() => import('@/features/platform/companies/companies-screen').then((module) => ({ default: module.AdminCompaniesScreen })));
const AdminCompanyDetailScreen = lazy(() => import('@/features/platform/companies/companies-screen').then((module) => ({ default: module.AdminCompanyDetailScreen })));
const AdminCommercialScreen = lazy(() => import('@/features/platform/operations/operations-screens').then((module) => ({ default: module.AdminCommercialScreen })));
const AdminCommercialDetailScreen = lazy(() => import('@/features/platform/operations/operations-screens').then((module) => ({ default: module.AdminCommercialDetailScreen })));
const AdminSystemScreen = lazy(() => import('@/features/platform/operations/operations-screens').then((module) => ({ default: module.AdminSystemScreen })));
const AdminAuditScreen = lazy(() => import('@/features/platform/operations/operations-screens').then((module) => ({ default: module.AdminAuditScreen })));
const AdminPendingModuleScreen = lazy(() => import('@/features/platform/screens/pending-module-screen').then((module) => ({ default: module.AdminPendingModuleScreen })));

function BootScreen() {
  return (
    <View style={styles.bootScreen}>
      <Text style={styles.bootTitle}>ManeComb</Text>
      <Text style={styles.bootText}>Admin Global</Text>
    </View>
  );
}

function decodePathId(pathname: string, prefix: string) {
  const encodedId = pathname.slice(prefix.length);
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return '';
  }
}

function Routes() {
  const pathname = usePathname().replace(/\/+$/, '') || '/';
  const bootstrap = useAdminStore((state) => state.bootstrap);
  const isBootstrapping = useAdminStore((state) => state.isBootstrapping);
  const mode = useAdminStore((state) => state.mode);

  useEffect(() => { void bootstrap(); }, [bootstrap]);

  if (isBootstrapping) return <BootScreen />;

  if (pathname.startsWith('/admin/companies/')) {
    const organizationId = decodePathId(pathname, '/admin/companies/');
    if (!organizationId) return <Redirect href="/admin/companies" />;
    return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Company Detail"><AdminCompanyDetailScreen organizationId={organizationId} /></ScreenErrorBoundary></AdminProtectedRoute>;
  }

  if (pathname.startsWith('/admin/commercial/')) {
    const orderId = decodePathId(pathname, '/admin/commercial/');
    if (!orderId) return <Redirect href="/admin/commercial" />;
    return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Commercial Detail"><AdminCommercialDetailScreen orderId={orderId} /></ScreenErrorBoundary></AdminProtectedRoute>;
  }

  switch (pathname) {
    case '/':
    case '/admin/login':
      return <ScreenErrorBoundary name="Admin Login"><AdminLoginScreen /></ScreenErrorBoundary>;
    case '/admin/mfa/setup':
      return <ScreenErrorBoundary name="Admin MFA Setup"><AdminMfaSetupScreen /></ScreenErrorBoundary>;
    case '/admin/mfa':
      return <ScreenErrorBoundary name="Admin MFA Verify"><AdminMfaVerifyScreen /></ScreenErrorBoundary>;
    case '/admin':
      return <AdminProtectedRoute><Redirect href="/admin/overview" /></AdminProtectedRoute>;
    case '/admin/overview':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Overview"><AdminOverviewScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    case '/admin/companies':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Companies"><AdminCompaniesScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    case '/admin/commercial':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Commercial"><AdminCommercialScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    case '/admin/system':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin System"><AdminSystemScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    case '/admin/audit':
      return <AdminProtectedRoute><ScreenErrorBoundary name="Admin Audit"><AdminAuditScreen /></ScreenErrorBoundary></AdminProtectedRoute>;
    default: {
      const item = findAdminNavigationItem(pathname);
      if (item && item.phase === 'P4') {
        return <AdminProtectedRoute><ScreenErrorBoundary name={`Admin ${item.label}`}><AdminPendingModuleScreen item={item} /></ScreenErrorBoundary></AdminProtectedRoute>;
      }
      return <Redirect href={mode === 'authenticated' ? '/admin/overview' : '/admin/login'} />;
    }
  }
}

function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const mode = useAdminStore((state) => state.mode);
  if (mode !== 'authenticated') return <Redirect href="/admin/login" />;
  return <>{children}</>;
}

export function App() {
  return <RouterProvider><Suspense fallback={<BootScreen />}><Routes /></Suspense></RouterProvider>;
}

const styles = StyleSheet.create({
  bootScreen: { alignItems: 'center', backgroundColor: '#050816', flex: 1, justifyContent: 'center', minHeight: '100vh' as any, padding: 24 },
  bootTitle: { color: '#F8FAFC', fontFamily: Typography.display, fontSize: 34, fontWeight: '900' },
  bootText: { color: '#A8B1C2', fontFamily: Typography.body, fontSize: 14, marginTop: 8 },
});
