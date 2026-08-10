/**
 * Normalizacion de los eventos realtime que deben producir feedback operativo.
 *
 * Esto NO decide la gravedad: la resuelve backend y viaja como `level`. Aqui
 * solo se reconoce si un evento es una alerta operativa y con que identidad,
 * para delegar en la politica nativa (ManeCombAlertPolicy), que es la unica que
 * traduce (category, level) a canal, sonido y vibracion.
 */

export type OperationalAlert = {
  incidentId: string;
  category: string;
  level: string;
  severity: string;
  title: string;
  body: string;
  deepLink: string;
};

const ALERT_CATEGORIES = new Set([
  'sos',
  'emergency',
  'emergencies',
  'emergencia',
  'emergencias',
  'incident',
  'incidents',
  'incidente',
  'incidencias',
]);

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/**
 * `notification:created` es el evento canonico: lo emite
 * `deliverOperationalNotification` a la audiencia ya autorizada. No se amplia
 * ningun destinatario aqui.
 */
export function toOperationalAlertFromNotification(payload: unknown): OperationalAlert | null {
  const notification = record(payload);
  const data = record(notification.data);
  const category = text(notification.category) || text(data.category);

  if (!ALERT_CATEGORIES.has(category.toLowerCase())) return null;

  const incidentId = text(data.incidentId) || text(notification.id);
  if (!incidentId) return null;

  return {
    incidentId,
    category,
    level: text(notification.level) || text(data.level),
    severity: text(data.severity),
    title: text(notification.title) || text(data.title) || 'Alerta operativa de ManeComb',
    body: text(notification.body) || text(data.body) || 'Nueva alerta operativa.',
    deepLink: text(notification.deepLink) || text(data.deepLink) || '/incidencias',
  };
}

/**
 * `incident:sos` acompaña al anterior para los criticos. Comparte incidentId,
 * asi que el dedup nativo hace que solo suene una vez.
 */
export function toOperationalAlertFromSos(payload: unknown): OperationalAlert | null {
  const envelope = record(payload);
  const fromNotification = toOperationalAlertFromNotification(envelope.notification);
  if (fromNotification) return fromNotification;

  const incident = record(envelope.incident);
  const incidentId = text(incident.id);
  if (!incidentId) return null;

  return {
    incidentId,
    category: 'sos',
    level: 'critical',
    severity: text(incident.severity) || 'critical',
    title: text(incident.title) ? `SOS activo: ${text(incident.title)}` : 'Alerta SOS de ManeComb',
    body: text(incident.description) || 'Nueva alerta SOS operativa.',
    deepLink: `/incidencias?incidentId=${encodeURIComponent(incidentId)}&focus=sos`,
  };
}

/**
 * Un cambio de estado no es una alerta nueva. Backend ya no emite notificacion
 * al pasar a in_progress ni a resolved; esta funcion existe para que ningun
 * consumidor futuro convierta `incident:updated` en sirena.
 */
export function shouldAlertForIncidentUpdate(): false {
  return false;
}
