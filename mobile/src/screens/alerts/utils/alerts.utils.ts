import type { Incident, IncidentDraft, IncidentSeverity, User } from '@/src/types/app';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import {
  INCIDENT_TYPE_STYLES,
  SEVERITY_STYLES,
  STATUS_STYLES,
  type IncidentFilterKey,
  type IncidentStatusKey,
  type IncidentTypeKey,
} from '../constants/alerts.constants';

export function normalizeSearchValue(value?: string | null) {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function getIncidentTypeKey(incident: Incident): IncidentTypeKey {
  const type = normalizeSearchValue(incident.type);
  const title = normalizeSearchValue(incident.title);
  if (type === 'sos' || title.startsWith('sos')) return 'sos';
  if (['traffic', 'trafico', 'route', 'ruta'].includes(type)) return 'traffic';
  if (['unit', 'unidad', 'vehicle', 'vehiculo', 'combi', 'bus'].includes(type)) return 'unit';
  if (['security', 'seguridad'].includes(type)) return 'security';
  if (['passengers', 'pasajeros', 'passenger'].includes(type)) return 'passengers';
  if (['maintenance', 'mantenimiento', 'service'].includes(type)) return 'maintenance';
  return 'general';
}

export function getIncidentStatusKey(status?: string | null): IncidentStatusKey {
  const normalized = normalizeSearchValue(status).replaceAll(' ', '_');
  if (['open', 'abierta', 'abierto'].includes(normalized)) return 'open';
  if (['in_progress', 'atendiendo', 'en_proceso', 'active', 'activa'].includes(normalized)) return 'in_progress';
  if (['resolved', 'closed', 'cerrada', 'cerrado', 'resuelta', 'resuelto'].includes(normalized)) return 'resolved';
  if (['canceled', 'cancelled', 'cancelada', 'cancelado'].includes(normalized)) return 'canceled';
  return 'unknown';
}

export function getSeverityStyle(severity?: string | null) {
  const normalized = normalizeSearchValue(severity) as IncidentSeverity;
  return SEVERITY_STYLES[normalized] || SEVERITY_STYLES.medium;
}

export function getIncidentUnitLabel(incident: Incident) {
  return incident.vehicle?.code || 'Sin unidad';
}

export function hasIncidentLocation(incident: Incident) {
  return Boolean(Number.isFinite(Number(incident.location?.latitude)) && Number.isFinite(Number(incident.location?.longitude)));
}

export function getIncidentContext(
  user: User | null,
  units: readonly OperationalUnitSnapshot[]
): Pick<IncidentDraft, 'location' | 'locationSourceTimestamp' | 'locationState' | 'routeId' | 'vehicleId'> {
  const unit = user?.vehicleId ? units.find((entry) => entry.unitId === user.vehicleId) || null : null;
  const isFresh = unit?.gps.freshness === 'fresh';
  const hasPosition = unit ? unit.gps.lat !== null && unit.gps.lng !== null : false;
  return {
    vehicleId: unit?.unitId || user?.vehicleId || null,
    routeId: unit?.route?.id || null,
    locationState: unit?.gps.freshness ?? 'missing',
    locationSourceTimestamp: unit?.gps.recordedAt || null,
    location: isFresh && hasPosition ? { latitude: unit!.gps.lat as number, longitude: unit!.gps.lng as number, timestamp: unit!.gps.recordedAt } : null,
  };
}

export function isIncidentActive(incident: Incident) {
  const status = getIncidentStatusKey(incident.status);
  return status !== 'resolved' && status !== 'canceled';
}

function isToday(value: string) {
  const incidentDate = new Date(value);
  const currentDate = new Date();
  return incidentDate.getFullYear() === currentDate.getFullYear() && incidentDate.getMonth() === currentDate.getMonth() && incidentDate.getDate() === currentDate.getDate();
}

export function matchesFilter(incident: Incident, filter: IncidentFilterKey) {
  const typeKey = getIncidentTypeKey(incident);
  if (filter === 'all') return true;
  if (filter === 'critical') return getSeverityStyle(incident.severity) === SEVERITY_STYLES.critical;
  if (filter === 'sos') return typeKey === 'sos';
  if (filter === 'unit') return typeKey === 'unit' || typeKey === 'maintenance';
  if (filter === 'today') return isToday(incident.createdAt);
  return typeKey === filter;
}

export function matchesSearch(incident: Incident, search: string) {
  if (!search) return true;
  return normalizeSearchValue([incident.title, incident.description, incident.type, incident.status, incident.severity, incident.vehicle?.code, incident.vehicleId, incident.route?.name, incident.route?.code].join(' ')).includes(search);
}

export { INCIDENT_TYPE_STYLES, STATUS_STYLES };
