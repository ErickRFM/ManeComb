const fs = require('fs');

function replaceExact(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly 1 match, got ${count}`);
  }
  return source.replace(oldValue, newValue);
}

const rootStorePath = 'mobile/src/store/root-store.ts';
let rootStore = fs.readFileSync(rootStorePath, 'utf8');
rootStore = replaceExact(
  rootStore,
  `  socket.io.on('reconnect_attempt', () => {\n    socketReconnectAttempts += 1;\n    setSocketTransition(set, 'reconnecting', 'socket_reconnect_attempt', {\n      reconnectAttempts: socketReconnectAttempts,\n    });\n    set({ networkStatus: 'recovering' });\n  });\n\n  socket.io.on('reconnect', () => {\n    missedHeartbeatAcks = 0;\n    setSocketTransition(set, 'reconnecting', 'socket_reconciling', {\n      missedHeartbeatAcks: 0,\n      reconnectAttempts: socketReconnectAttempts,\n    });\n    set({ networkStatus: 'recovering' });\n    joinCurrentConversationRooms(get);\n    void Promise.all([\n      get().refreshAll(),\n      get().flushPendingSync(),\n    ]).finally(() => {\n      set({ networkStatus: 'online' });\n      setSocketTransition(set, 'connected', 'socket_reconciled', {\n        missedHeartbeatAcks: 0,\n        reconnectAttempts: socketReconnectAttempts,\n      });\n    });\n  });\n`,
  `  socket.io.on('reconnect_attempt', () => {\n    socketReconnectAttempts += 1;\n    setSocketTransition(set, 'reconnecting', 'socket_reconnect_attempt', {\n      reconnectAttempts: socketReconnectAttempts,\n    });\n  });\n\n  socket.io.on('reconnect', () => {\n    missedHeartbeatAcks = 0;\n    setSocketTransition(set, 'connected', 'socket_reconnected', {\n      missedHeartbeatAcks: 0,\n      reconnectAttempts: socketReconnectAttempts,\n    });\n    joinCurrentConversationRooms(get);\n    // El transporte ya esta conectado. La reconciliacion de datos corre en segundo\n    // plano y no vuelve a degradar socket/network ni sostiene chrome de reconexion.\n    void Promise.allSettled([\n      get().refreshAll(),\n      get().flushPendingSync(),\n    ]);\n  });\n`,
  'latest-main socket reconnect block'
);
fs.writeFileSync(rootStorePath, rootStore);

const checklistPath = 'mobile/src/screens/checklist-screen.tsx';
let checklist = fs.readFileSync(checklistPath, 'utf8');
checklist = replaceExact(
  checklist,
  `  const loadSessionHistory = useCallback(async () => {\n    try {\n      useAppStore.setState({ routeSessionHistory: await getRouteSessionHistoryRequest({ limit: 500 }) });\n      setHistoryLoadError(false);\n    } catch {\n      setHistoryLoadError(true);\n    }\n  }, []);\n\n  useEffect(() => {\n    if (user) loadSessionHistory();\n  }, [loadSessionHistory, user, syncedActiveSession]);\n`,
  `  const loadSessionHistory = useCallback(async () => {\n    try {\n      useAppStore.setState({ routeSessionHistory: await getRouteSessionHistoryRequest({ limit: 500 }) });\n      setHistoryLoadError(false);\n    } catch {\n      // Si ya existe historial valido, un fallo transitorio no debe convertir\n      // datos visibles en un error duro ni provocar saltos de layout.\n      setHistoryLoadError(useAppStore.getState().routeSessionHistory.length === 0);\n    }\n  }, []);\n\n  const historyRefreshKey = \`${'${user?.id || \'none\'}'}:${'${syncedActiveSession?.id || \'none\'}'}:${'${syncedActiveSession?.status || \'none\'}'}:${'${syncedActiveSession?.finishedAt || \'\'}'}\`;\n  const lastHistoryRefreshKeyRef = useRef(historyRefreshKey);\n\n  useEffect(() => {\n    if (!user) return;\n\n    const hasCachedHistory = useAppStore.getState().routeSessionHistory.length > 0;\n    const semanticSessionChanged = lastHistoryRefreshKeyRef.current !== historyRefreshKey;\n    if (!hasCachedHistory || semanticSessionChanged) {\n      lastHistoryRefreshKeyRef.current = historyRefreshKey;\n      loadSessionHistory().catch(() => undefined);\n      return;\n    }\n\n    setHistoryLoadError(false);\n  }, [historyRefreshKey, loadSessionHistory, user]);\n`,
  'latest-main checklist history policy'
);
checklist = replaceExact(
  checklist,
  `        <ScrollView\n          horizontal\n          showsHorizontalScrollIndicator={false}\n          contentContainerStyle={styles.filterScrollContent}>\n`,
  `        <ScrollView\n          horizontal\n          bounces={false}\n          overScrollMode="never"\n          showsHorizontalScrollIndicator={false}\n          contentContainerStyle={styles.filterScrollContent}>\n`,
  'latest-main checklist filter scroll'
);
checklist = replaceExact(
  checklist,
  `        {historyLoadError ? (\n`,
  `        {historyLoadError && sessionHistory.length === 0 ? (\n`,
  'latest-main checklist cached history error guard'
);
fs.writeFileSync(checklistPath, checklist);

console.log('latest-main reconnect reconciliation applied');
