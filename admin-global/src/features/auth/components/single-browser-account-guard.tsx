import { type PropsWithChildren, useEffect } from 'react';
import { createSingleBrowserIdentityCoordinator } from '@shared/browser-session/single-browser-identity';
import { useAdminStore } from '../store';

const ACTIVE_IDENTITY_KEY = 'manecomb-platform-active-identity:v1';

const browserIdentityCoordinator = createSingleBrowserIdentityCoordinator({
  storageKey: ACTIVE_IDENTITY_KEY,
  getCurrentIdentity: () => useAdminStore.getState().session?.user.id || null,
  onDifferentIdentity: () => {
    window.location.reload();
  },
});

/**
 * Admin Global permite varias pestañas de la misma identidad, pero una identidad
 * distinta releva a la anterior dentro del mismo navegador.
 */
export function SingleBrowserAdminAccountGuard({ children }: PropsWithChildren) {
  const userId = useAdminStore((state) => state.session?.user.id || null);

  useEffect(() => {
    browserIdentityCoordinator.start();
    return () => browserIdentityCoordinator.stop();
  }, []);

  useEffect(() => {
    browserIdentityCoordinator.publish(userId);
  }, [userId]);

  return <>{children}</>;
}
