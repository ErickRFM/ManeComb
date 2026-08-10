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

const recoveringLine = "    set({ networkStatus: 'recovering' });\n";
const recoveringCount = rootStore.split(recoveringLine).length - 1;
if (recoveringCount !== 2) {
  throw new Error(`root-store recovering markers: expected 2, got ${recoveringCount}`);
}
rootStore = rootStore.split(recoveringLine).join('');
rootStore = replaceExact(
  rootStore,
  "    setSocketTransition(set, 'reconnecting', 'socket_reconciling', {\n",
  "    setSocketTransition(set, 'connected', 'socket_reconnected', {\n",
  'root-store reconnect transition'
);
rootStore = replaceExact(
  rootStore,
  `    void Promise.all([\n      get().refreshAll(),\n      get().flushPendingSync(),\n    ]).finally(() => {\n      set({ networkStatus: 'online' });\n      setSocketTransition(set, 'connected', 'socket_reconciled', {\n        missedHeartbeatAcks: 0,\n        reconnectAttempts: socketReconnectAttempts,\n      });\n    });\n`,
  `    // El transporte ya esta conectado. La reconciliacion de datos corre en segundo\n    // plano y no vuelve a degradar socket/network ni sostiene chrome de reconexion.\n    void Promise.allSettled([\n      get().refreshAll(),\n      get().flushPendingSync(),\n    ]);\n`,
  'root-store reconnect reconciliation'
);
fs.writeFileSync(rootStorePath, rootStore);

const checklistPath = 'mobile/src/screens/checklist-screen.tsx';
let checklist = fs.readFileSync(checklistPath, 'utf8');
checklist = replaceExact(
  checklist,
  `    } catch {\n      setHistoryLoadError(true);\n    }\n  }, []);\n\n  useEffect(() => {\n    if (user) loadSessionHistory();\n  }, [loadSessionHistory, user, syncedActiveSession]);\n`,
  `    } catch {\n      // Si ya existe historial valido, un fallo transitorio no debe convertir\n      // datos visibles en un error duro ni provocar saltos de layout.\n      setHistoryLoadError(useAppStore.getState().routeSessionHistory.length === 0);\n    }\n  }, []);\n\n  const historyRefreshKey = \`${'${user?.id || \'none\'}'}:${'${syncedActiveSession?.id || \'none\'}'}:${'${syncedActiveSession?.status || \'none\'}'}:${'${syncedActiveSession?.finishedAt || \'\'}'}\`;\n  const lastHistoryRefreshKeyRef = useRef(historyRefreshKey);\n\n  useEffect(() => {\n    if (!user) return;\n\n    const hasCachedHistory = useAppStore.getState().routeSessionHistory.length > 0;\n    const semanticSessionChanged = lastHistoryRefreshKeyRef.current !== historyRefreshKey;\n    if (!hasCachedHistory || semanticSessionChanged) {\n      lastHistoryRefreshKeyRef.current = historyRefreshKey;\n      void loadSessionHistory();\n      return;\n    }\n\n    setHistoryLoadError(false);\n  }, [historyRefreshKey, loadSessionHistory, user?.id]);\n`,
  'checklist history loading policy'
);
checklist = replaceExact(
  checklist,
  `{historyLoadError ? (\n`,
  `{historyLoadError && sessionHistory.length === 0 ? (\n`,
  'checklist cached history error guard'
);
checklist = replaceExact(
  checklist,
  `        <ScrollView\n          horizontal\n          showsHorizontalScrollIndicator={false}\n`,
  `        <ScrollView\n          horizontal\n          bounces={false}\n          overScrollMode="never"\n          showsHorizontalScrollIndicator={false}\n`,
  'checklist filter scroll stability'
);
fs.writeFileSync(checklistPath, checklist);

console.log('mobile reconnect stability codemod applied');
