import { useRadioLiveStore } from '@/src/features/radio-live/radio-live-store';
import {
  clearSessionNotifications,
  deleteNativePushToken,
} from '@/src/utils/push-notifications';
import { useAppStore } from './root-store';

type LifecycleGlobal = typeof globalThis & {
  __MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__?: boolean;
};

function teardownNativeSessionResources() {
  void Promise.allSettled([
    clearSessionNotifications(),
    deleteNativePushToken(),
  ]);
}

/**
 * Observa únicamente la autoridad de identidad del root-store y limpia recursos
 * nativos que sobreviven al árbol React. No decide auth, permisos ni sesión.
 */
export function installNativeSessionLifecycle() {
  const runtime = globalThis as LifecycleGlobal;
  if (runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__) return;
  runtime.__MANECOMB_NATIVE_SESSION_TEARDOWN_SUBSCRIBED__ = true;

  useAppStore.subscribe((state, previousState) => {
    const previousHadIdentity = Boolean(previousState.token && previousState.user?.id);
    const currentHasIdentity = Boolean(state.token && state.user?.id);
    const identityJustEnded = previousHadIdentity && !currentHasIdentity;
    const unauthenticatedBootstrapJustSettled =
      state.isHydrated &&
      !state.isBootstrapping &&
      !currentHasIdentity &&
      (!previousState.isHydrated || previousState.isBootstrapping);

    const signOutJustStarted = state.isSigningOut && !previousState.isSigningOut;
    if (signOutJustStarted || identityJustEnded || unauthenticatedBootstrapJustSettled) {
      useRadioLiveStore.getState().reset();
    }

    if (!identityJustEnded && !unauthenticatedBootstrapJustSettled) return;

    if (
      state.isSubmitting ||
      state.isLoadingConversation ||
      state.isLoadingChatContacts
    ) {
      useAppStore.setState({
        isSubmitting: false,
        isLoadingConversation: false,
        isLoadingChatContacts: false,
      });
    }

    teardownNativeSessionResources();
  });
}
