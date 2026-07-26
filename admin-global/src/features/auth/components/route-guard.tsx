import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Redirect } from '@/components/router';
import { useAdminStore } from '../store';
import { platformSessionRequest } from '../api';

function useBootstrapOnce() {
  const bootstrap = useAdminStore((s) => s.bootstrap);
  const isBootstrapping = useAdminStore((s) => s.isBootstrapping);
  const didBoot = useRef(false);

  useEffect(() => {
    if (didBoot.current) return;
    didBoot.current = true;
    bootstrap();
  }, [bootstrap]);
  return isBootstrapping;
}

export function AdminProtectedRoute({ children }: { children: React.ReactNode }) {
  const mode = useAdminStore((s) => s.mode);
  const session = useAdminStore((s) => s.session);
  const sessionInfo = useAdminStore((s) => s.sessionInfo);
  const isBootstrapping = useBootstrapOnce();
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (mode !== 'authenticated' || !session) return;
    platformSessionRequest(session.token)
      .then(({ session: info }) => {
        if (!info.mfaVerified) setSessionValid(false);
        else { useAdminStore.setState({ sessionInfo: info }); setSessionValid(true); }
      })
      .catch(() => setSessionValid(false));
  }, [mode, session]);

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050816', minHeight: '100vh' as any }}>
        <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '800' }}>Cargando sesión...</Text>
      </View>
    );
  }

  if (mode !== 'authenticated') return <Redirect href="/admin/login" />;
  if (sessionValid === false) return <Redirect href="/admin/login" />;
  if (sessionValid === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050816', minHeight: '100vh' as any }}>
        <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '800' }}>Verificando sesión...</Text>
      </View>
    );
  }
  return <>{children}</>;
}

export function AdminLoginGuard({ children }: { children?: React.ReactNode }) {
  const mode = useAdminStore((s) => s.mode);
  const isBootstrapping = useBootstrapOnce();

  if (isBootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#050816', minHeight: '100vh' as any }}>
        <Text style={{ color: '#F8FAFC', fontSize: 16, fontWeight: '800' }}>Cargando sesión...</Text>
      </View>
    );
  }
  if (mode === 'authenticated') return <Redirect href="/admin" />;
  return <>{children}</>;
}

export function AdminMfaEnrollGuard({ children }: { children: React.ReactNode }) {
  const mode = useAdminStore((s) => s.mode);
  if (mode !== 'mfa_enrollment') return <Redirect href="/admin/login" />;
  return <>{children}</>;
}

export function AdminMfaChallengeGuard({ children }: { children: React.ReactNode }) {
  const mode = useAdminStore((s) => s.mode);
  if (mode !== 'mfa_challenge') return <Redirect href="/admin/login" />;
  return <>{children}</>;
}
