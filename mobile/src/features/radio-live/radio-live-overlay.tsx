import React, { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { navigationRef } from '@/src/navigation/router';
import { MODULE_ROUTE_NAMES } from '@/src/navigation/route-registry';
import { useCallStore } from '@/src/features/calls/call-store';
import { getSharedRealtimeSocket, useAppStore } from '@/src/store/use-app-store';
import { setRadioRealtimeSuspended } from '@/src/screens/radio/services/radio-realtime-service';
import {
  acquireRadioForegroundService,
  releaseRadioForegroundService,
} from './radio-foreground-service';
import { createNativeRadioLiveRuntime } from './radio-live-runtime';
import {
  setRadioLiveRuntimeFactory,
  useRadioLiveStore,
} from './radio-live-store';

setRadioLiveRuntimeFactory(createNativeRadioLiveRuntime);

function useCurrentRouteName() {
  const [routeName, setRouteName] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setRouteName(navigationRef.getCurrentRoute()?.name || null);
    };

    update();
    const unsubscribe = navigationRef.addListener('state', update);
    return unsubscribe;
  }, []);

  return routeName;
}

export function RadioLiveOverlay(): React.ReactElement | null {
  const routeName = useCurrentRouteName();
  const callPhase = useCallStore((state) => state.phase);
  const { activate, pause, reset } = useRadioLiveStore(
    useShallow((state) => ({
      activate: state.activate,
      pause: state.pause,
      reset: state.reset,
    }))
  );
  const {
    authContext,
    conversations,
    openGeneralConversation,
    socketStatus,
    token,
    user,
  } = useAppStore(
    useShallow((state) => ({
      authContext: state.authContext,
      conversations: state.conversations,
      openGeneralConversation: state.openGeneralConversation,
      socketStatus: state.socketStatus,
      token: state.token,
      user: state.user,
    }))
  );
  const [channelId, setChannelId] = useState<string | null>(null);
  const [ensureAttempt, setEnsureAttempt] = useState(0);
  const channelOwnerRef = useRef<string | null>(null);

  const eligible = Boolean(user && token && authContext?.canAccessMobile === true);
  const screenOwnsRadio = routeName === '/radio' || routeName === MODULE_ROUTE_NAMES.radio;
  const callOwnsAudio = ['CONNECTING', 'CONNECTED', 'RECONNECTING', 'ENDING'].includes(callPhase);

  useEffect(() => {
    setRadioRealtimeSuspended(callOwnsAudio);
    return () => setRadioRealtimeSuspended(false);
  }, [callOwnsAudio]);

  useEffect(() => {
    const nextOwner = user?.id || null;
    if (channelOwnerRef.current === nextOwner) return;
    channelOwnerRef.current = nextOwner;
    setChannelId(null);
    setEnsureAttempt(0);
    reset();
  }, [reset, user?.id]);

  useEffect(() => {
    if (!eligible || !user) {
      setChannelId(null);
      reset();
      return undefined;
    }

    const existingGeneral = conversations.find(
      (conversation) =>
        conversation.channelMode === 'radio' && conversation.kind === 'group'
    );

    if (existingGeneral?.id) {
      setChannelId(existingGeneral.id);
      return undefined;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    openGeneralConversation('radio', { setActive: false })
      .then((conversation) => {
        if (!cancelled && conversation?.id) {
          setChannelId(conversation.id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          retryTimer = setTimeout(() => setEnsureAttempt((value) => value + 1), 10000);
        }
      });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [conversations, eligible, ensureAttempt, openGeneralConversation, reset, user]);

  // Claim the native service before stopping the global runtime. This makes the
  // Mapa -> Radio handoff continuous and prevents startForegroundService/stopService
  // from crossing during the first screen mount.
  useEffect(() => {
    if (!eligible || !screenOwnsRadio || callOwnsAudio) {
      releaseRadioForegroundService('screen').catch(() => undefined);
      return undefined;
    }

    acquireRadioForegroundService('screen').catch(() => undefined);
    return () => {
      releaseRadioForegroundService('screen').catch(() => undefined);
    };
  }, [callOwnsAudio, eligible, screenOwnsRadio]);

  useEffect(() => {
    if (!eligible || !user || !channelId) return;

    if (callOwnsAudio) {
      pause('call');
      return;
    }

    if (screenOwnsRadio) {
      pause('screen');
      return;
    }

    const socket = getSharedRealtimeSocket();
    if (!socket) return;

    activate({ channelId, socket, userId: user.id });
  }, [
    activate,
    callOwnsAudio,
    channelId,
    eligible,
    pause,
    screenOwnsRadio,
    socketStatus,
    user,
  ]);

  useEffect(
    () => () => {
      setRadioRealtimeSuspended(false);
      releaseRadioForegroundService('screen').catch(() => undefined);
      reset();
    },
    [reset]
  );

  return null;
}
