import type { StatusBadgeTone } from '@/src/components/ui/status-badge';
import type { Vehicle } from '@/src/types/app';
import { MAINTENANCE_INTERVAL_KM } from './units.constants';
import type { UnitEditor } from './units.types';

export function getMaintenanceInfo(vehicle: Vehicle) {
  const km = Number(vehicle.currentKilometers);
  if (!Number.isFinite(km) || km <= 0) return null;
  const lastMaintenanceKm = vehicle.status === 'maintenance' ? km : Math.floor(km / MAINTENANCE_INTERVAL_KM) * MAINTENANCE_INTERVAL_KM;
  const nextMaintenanceKm = lastMaintenanceKm + MAINTENANCE_INTERVAL_KM;
  const kmRemaining = Math.max(0, nextMaintenanceKm - km);
  const overdue = kmRemaining === 0 && vehicle.status !== 'maintenance';
  return { lastMaintenanceKm, nextMaintenanceKm, kmRemaining, overdue };
}
export function createBlankEditor(): UnitEditor {
  return {
    code: '',
    plate: '',
    currentKilometers: '',
    status: 'available',
  };
}

export function getUnitStatus(vehicle: Vehicle): { label: string; tone: StatusBadgeTone } {
  if (vehicle.retiredAt || vehicle.status === 'retired') {
    return { label: 'Retirada', tone: 'neutral' };
  }
  if (vehicle.status === 'maintenance') {
    return { label: 'Mantenimiento', tone: 'warning' };
  }

  if (vehicle.driverId) {
    return { label: 'Asignada', tone: 'positive' };
  }

  return { label: 'Disponible', tone: 'info' };
}

export function getKilometersLabel(value: unknown) {
  const kilometers = Number(value);
  return Number.isFinite(kilometers) && kilometers > 0
    ? `${kilometers.toLocaleString('es-MX')} km`
    : 'Sin kilometraje registrado';
}
