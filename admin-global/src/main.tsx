import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import { App } from './App';
import { assertPrivateAdminRuntimeConfiguration } from './lib/private-runtime';

assertPrivateAdminRuntimeConfiguration();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
