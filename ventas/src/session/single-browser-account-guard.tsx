import { type PropsWithChildren, useEffect, useMemo } from 'react';
import { createSingleBrowserIdentityCoordinator } from '@shared/browser-session/single-browser-identity';
import { useAppStore } from '@/src/store/use-app-store';

const ACTIVE_IDENTITY_KEY = 'manecomb-ventas-active-identity:v1';

const browserIdentityCoordinator = createSingleBrowserIdentityCoordinator({
  storageKey: ACTIVE_IDENTITY_KEY,
  getCurrentIdentity: () => {
    const user = useAppStore.getState().user;
    if (!user?.id) return null;
    return `${String(user.organizationId || 'no-org')}:${user.id}`;
  },
  onDifferentIdentity: () => {
    window.location.reload();
  },
});

/**
 * Mantiene una sola identidad empresarial distinta por navegador. La misma
 * cuenta puede usar varias pestañas; una cuenta diferente releva a la anterior.
 */
export function SingleBrowserAccountGuard({ children }: PropsWithChildren) {
  const userId = useAppStore((state) => state.user?.id || null);
  const organizationId = useAppStore((state) => state.user?.organizationId || null);
  const identity = useMemo(
    () => (userId ? `${String(organizationId || 'no-org')}:${userId}` : null),
    [organizationId, userId]
  );

  useEffect(() => {
    browserIdentityCoordinator.start();
    return () => browserIdentityCoordinator.stop();
  }, []);

  useEffect(() => {
    browserIdentityCoordinator.publish(identity);
  }, [identity]);

  return <>{children}</>;
}
