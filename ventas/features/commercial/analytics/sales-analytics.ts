import { Platform } from 'react-native';
import { apiClient } from '@/src/api/client';

export type SalesEventName =
  | 'landing_view'
  | 'plan_selected'
  | 'trial_selected'
  | 'registration_started'
  | 'registration_completed'
  | 'registration_failed'
  | 'login_started'
  | 'login_completed'
  | 'login_failed'
  | 'checkout_viewed'
  | 'payment_method_selected'
  | 'checkout_started'
  | 'checkout_failed'
  | 'checkout_redirected'
  | 'checkout_completed'
  | 'payment_pending'
  | 'portal_first_open'
  | 'activation_key_created'
  | 'first_driver_activated';

export type SalesEventMetadata = {
  planId?: string | null;
  requestTrial?: boolean;
  route?: string | null;
  paymentMethod?: string | null;
  providerMode?: string | null;
  outcome?: string | null;
  source?: string | null;
};

const SALES_SESSION_KEY = 'manecomb:sales-session';
let memorySessionId: string | null = null;

function createSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `sales-${globalThis.crypto.randomUUID()}`;
  }

  return `sales-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getSalesSessionId() {
  if (memorySessionId) return memorySessionId;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      const stored = window.sessionStorage?.getItem(SALES_SESSION_KEY);
      if (stored) {
        memorySessionId = stored;
        return stored;
      }

      const created = createSessionId();
      window.sessionStorage?.setItem(SALES_SESSION_KEY, created);
      memorySessionId = created;
      return created;
    } catch {
      // sessionStorage puede estar deshabilitado; la sesion en memoria basta.
    }
  }

  memorySessionId = createSessionId();
  return memorySessionId;
}

function sanitizeMetadata(metadata: SalesEventMetadata) {
  return {
    ...(metadata.planId ? { planId: String(metadata.planId).slice(0, 80) } : {}),
    ...(metadata.route ? { route: String(metadata.route).slice(0, 100) } : {}),
    ...(metadata.paymentMethod ? { paymentMethod: String(metadata.paymentMethod).slice(0, 30) } : {}),
    ...(metadata.providerMode ? { providerMode: String(metadata.providerMode).slice(0, 30) } : {}),
    ...(metadata.outcome ? { outcome: String(metadata.outcome).slice(0, 40) } : {}),
    ...(metadata.source ? { source: String(metadata.source).slice(0, 50) } : {}),
    ...(typeof metadata.requestTrial === 'boolean' ? { requestTrial: metadata.requestTrial } : {}),
  };
}

/**
 * Funnel first-party de ManeComb. Nunca recibe email, telefono, nombre,
 * contrasena, datos de tarjeta, documentos ni contenido de comunicaciones.
 * La telemetria es secundaria: un fallo nunca puede bloquear la compra.
 */
export function trackSalesEvent(eventName: SalesEventName, metadata: SalesEventMetadata = {}) {
  const payload = {
    eventName,
    sessionId: getSalesSessionId(),
    metadata: sanitizeMetadata(metadata),
  };

  void apiClient.post('/sales-events', payload, { timeout: 3500 }).catch(() => undefined);
}
