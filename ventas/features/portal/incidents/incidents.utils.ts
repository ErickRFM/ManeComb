export function getSeverityMeta(severity: string) {
  if (severity === 'critical') return { label: 'Crítica', tone: 'danger' as const };
  if (severity === 'high') return { label: 'Alta', tone: 'warning' as const };
  if (severity === 'medium') return { label: 'Media', tone: 'neutral' as const };
  return { label: 'Baja', tone: 'positive' as const };
}

export function getStatusMeta(status: string) {
  if (status === 'resolved') return { label: 'Resuelto', tone: 'positive' as const };
  if (status === 'in_progress') return { label: 'En proceso', tone: 'warning' as const };
  return { label: 'Abierto', tone: 'danger' as const };
}

export function getTypeIcon(type: string) {
  if (/accident|choque|colision/i.test(type)) return 'car-crash';
  if (/mecanic|falla|descompostura/i.test(type)) return 'engine-outline';
  if (/cliente|queja|reclamo/i.test(type)) return 'account-alert-outline';
  if (/seguridad|robo|asalto/i.test(type)) return 'shield-alert-outline';
  return 'alert-circle-outline';
}


const INCIDENT_TYPE_LABELS: Record<string, string> = {
  accident: 'Accidente',
  collision: 'Colisión',
  mechanical_failure: 'Falla mecánica',
  route_deviation: 'Desvío de ruta',
  security: 'Seguridad',
  robbery: 'Robo o asalto',
  passenger_incident: 'Incidente con pasajero',
  customer_complaint: 'Queja de cliente',
  medical_emergency: 'Emergencia médica',
  sos: 'Alerta SOS',
};

export function formatIncidentType(type: string) {
  const normalized = String(type || '').trim();
  if (!normalized) return 'Incidencia';
  const direct = INCIDENT_TYPE_LABELS[normalized.toLowerCase()];
  if (direct) return direct;
  return normalized
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}
