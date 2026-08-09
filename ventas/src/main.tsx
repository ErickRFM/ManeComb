import './global.css';
import './portal-polish.css';

import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/error-boundary';

const root = document.getElementById('root');

if (!root) {
  throw new Error('No se encontro el nodo root para montar ManeComb Ventas.');
}

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
