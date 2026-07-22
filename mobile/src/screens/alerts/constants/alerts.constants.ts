import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import type { IncidentSeverity } from '@/src/types/app';

export const INCIDENT_TYPES = ['traffic', 'maintenance', 'security', 'passengers'] as const;
export const SEVERITIES: IncidentSeverity[] = ['medium', 'high', 'critical'];
export const INITIAL_VISIBLE_EVENTS = 8;

export type IncidentTypeKey =
  | 'traffic'
  | 'unit'
  | 'security'
  | 'sos'
  | 'passengers'
  | 'maintenance'
  | 'general';
export type IncidentStatusKey = 'open' | 'in_progress' | 'resolved' | 'canceled' | 'unknown';
export type IncidentFilterKey = 'all' | 'critical' | 'sos' | 'unit' | 'traffic' | 'security' | 'today';
export type IncidentIcon = keyof typeof MaterialCommunityIcons.glyphMap;
export type IncidentVisualStyle = {
  backgroundColor: string;
  color: string;
  icon: IncidentIcon;
  label: string;
};
export type SeverityVisualStyle = {
  backgroundColor: string;
  color: string;
  label: string;
};

export const INCIDENT_TYPE_STYLES: Record<IncidentTypeKey, IncidentVisualStyle> = {
  traffic: { backgroundColor: 'rgba(79, 141, 255, 0.15)', color: '#5F98FF', icon: 'routes', label: 'Trafico' },
  unit: { backgroundColor: 'rgba(230, 161, 31, 0.16)', color: '#E6A11F', icon: 'bus-alert', label: 'Unidad' },
  security: { backgroundColor: 'rgba(165, 107, 255, 0.15)', color: '#A56BFF', icon: 'shield-alert-outline', label: 'Seguridad' },
  sos: { backgroundColor: 'rgba(240, 106, 106, 0.16)', color: '#F06A6A', icon: 'alert-octagon-outline', label: 'SOS' },
  passengers: { backgroundColor: 'rgba(217, 111, 167, 0.15)', color: '#D96FA7', icon: 'account-alert-outline', label: 'Pasajeros' },
  maintenance: { backgroundColor: 'rgba(53, 200, 107, 0.15)', color: '#35C86B', icon: 'wrench-check-outline', label: 'Mantenimiento' },
  general: { backgroundColor: 'rgba(159, 176, 202, 0.14)', color: '#A8B1C2', icon: 'alert-circle-outline', label: 'General' },
};

export const SEVERITY_STYLES: Record<IncidentSeverity, SeverityVisualStyle> = {
  low: { backgroundColor: 'rgba(159, 176, 202, 0.14)', color: '#A8B1C2', label: 'Baja' },
  medium: { backgroundColor: 'rgba(230, 161, 31, 0.14)', color: '#E6A11F', label: 'Media' },
  high: { backgroundColor: 'rgba(242, 140, 40, 0.16)', color: '#F28C28', label: 'Alta' },
  critical: { backgroundColor: 'rgba(240, 106, 106, 0.16)', color: '#F06A6A', label: 'Critica' },
};

export const STATUS_STYLES: Record<IncidentStatusKey, SeverityVisualStyle> = {
  open: { backgroundColor: 'rgba(230, 161, 31, 0.14)', color: '#E6A11F', label: 'Abierta' },
  in_progress: { backgroundColor: 'rgba(79, 141, 255, 0.15)', color: '#5F98FF', label: 'Atendiendo' },
  resolved: { backgroundColor: 'rgba(53, 200, 107, 0.15)', color: '#35C86B', label: 'Cerrada' },
  canceled: { backgroundColor: 'rgba(159, 176, 202, 0.14)', color: '#A8B1C2', label: 'Cancelada' },
  unknown: { backgroundColor: 'rgba(159, 176, 202, 0.14)', color: '#A8B1C2', label: 'Estado desconocido' },
};

export const FILTERS: { icon: IncidentIcon; key: IncidentFilterKey; label: string }[] = [
  { key: 'all', label: 'Todas', icon: 'format-list-bulleted' },
  { key: 'critical', label: 'Criticas', icon: 'alert-decagram-outline' },
  { key: 'sos', label: 'SOS', icon: 'alert-octagon-outline' },
  { key: 'unit', label: 'Unidad', icon: 'bus-alert' },
  { key: 'traffic', label: 'Trafico', icon: 'routes' },
  { key: 'security', label: 'Seguridad', icon: 'shield-alert-outline' },
  { key: 'today', label: 'Hoy', icon: 'calendar-today' },
];
