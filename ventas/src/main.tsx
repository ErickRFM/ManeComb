import './global.css';
import './portal-polish.css';
import './routes-map-polish.css';
import './operations-mobile-polish.css';

import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/error-boundary';
import { PortalRealtimeRecoveryGuard } from './realtime/portal-realtime-recovery-guard';
import { SingleBrowserAccountGuard } from './session/single-browser-account-guard';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontro el nodo root para montar ManeComb Ventas.');
}

createRoot(root).render(
  <ErrorBoundary>
    <SingleBrowserAccountGuard>
      <PortalRealtimeRecoveryGuard>
        <App />
      </PortalRealtimeRecoveryGuard>
    </SingleBrowserAccountGuard>
  </ErrorBoundary>
);