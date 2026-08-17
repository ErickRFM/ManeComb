import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePortalStore } from '@/features/portal/store/use-portal-store';
import { hasPortalPermission, hasPortalRtcAccess } from '@/features/portal/utils/access';
import {
  getSharedPortalRealtimeSocket,
  subscribeSharedPortalRealtimeSocket,
  useAppStore,
} from '@/src/store/use-app-store';
import { usePortalCallStore } from './call-store';
import { usePortalCommunicationStore } from './communication-store';
import { usePortalE2eeStore } from './e2ee-store';
import { PortalCallOverlay } from './portal-call-overlay';

type CommunicationUserShape = {
  id: string;
  capabilities?: string[] | null;
  e2eePublicKey?: string | null;
};

/**
 * Único montaje de Comunicación en web. Consume la sesión, suscripción y Socket.IO
 * canónicos del Portal; Chat y Calls no crean transporte ni identidad propios.
 */
export function PortalCommunicationRuntime() {
  const user = useAppStore((state) => state.user) as (ReturnType<typeof useAppStore.getState>['user'] & CommunicationUserShape) | null;
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
  const canChat = Boolean(user && hasPortalPermission(user, 'communication'));
  const canCall = Boolean(user && hasPortalRtcAccess(user));
  const operational = resolvedSubscription?.isActive === true;

  useEffect(() => {
    if (user && (canChat || canCall) && !authorityReady && !isLoading) {
      void loadOverview();
    }
  }, [authorityReady, canCall, canChat, isLoading, loadOverview, user]);

  useEffect(() => {
    if (!user || !operational || (!canChat && !canCall)) {
      usePortalCommunicationStore.getState().reset();
      usePortalCallStore.getState().reset();
      usePortalE2eeStore.getState().reset();
      return;
    }

    if (canChat) {
      void usePortalCommunicationStore.getState().initialize(user.id);
      void usePortalE2eeStore.getState().initialize({
        userId: user.id,
        e2eePublicKey: user.e2eePublicKey,
      });
    } else {
      usePortalCommunicationStore.getState().reset();
      usePortalE2eeStore.getState().reset();
    }

    const bind = (socket: ReturnType<typeof getSharedPortalRealtimeSocket>) => {
      usePortalCommunicationStore.getState().bindSocket(canChat ? socket : null);
      usePortalCallStore.getState().bindSocket(canCall ? socket : null);
    };

    const unsubscribe = subscribeSharedPortalRealtimeSocket(bind);
    bind(getSharedPortalRealtimeSocket());

    return () => {
      unsubscribe();
      usePortalCommunicationStore.getState().bindSocket(null);
      usePortalCallStore.getState().bindSocket(null);
    };
  }, [canCall, canChat, operational, user?.e2eePublicKey, user?.id]);

  if (!user || !operational || !canCall) return null;
  return <PortalCallOverlay />;
}
