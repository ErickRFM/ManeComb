import type { OperationalJourney, OperationalUnitSnapshot } from './types';

export type JourneyLifecycleStatus = OperationalJourney['status'] | 'FINISHED' | 'CANCELLED';

const JOURNEY_STATUS_LABELS: Record<JourneyLifecycleStatus, string> = {
  ASSIGNED: 'Asignada',
  READY: 'Lista para iniciar',
  RUNNING: 'En jornada',
  PAUSED: 'Pausada',
  FINISHED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export function journeyStatusLabelForStatus(status?: string | null): string {
  if (!status) return 'Sin estado';
  return JOURNEY_STATUS_LABELS[status as JourneyLifecycleStatus] || status.replace(/[-_]/g, ' ');
}

export function journeyStatusLabel(journey: OperationalJourney | null): string {
  return journey ? journeyStatusLabelForStatus(journey.status) : 'Sin jornada';
}

export function journeyPrimaryAction(journey: OperationalJourney | null):
  | 'confirm'
  | 'start'
  | 'pause'
  | 'resume'
  | null {
  if (!journey) return null;
  if (journey.requiresDriverConfirmation) return 'confirm';
  if (journey.canStart) return 'start';
  if (journey.isDriving) return 'pause';
  if (journey.isPaused) return 'resume';
  return null;
}

export function selectJourneyForDriver(
  units: readonly OperationalUnitSnapshot[],
  driverId: string | null | undefined
): OperationalJourney | null {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  return (
    units.find((unit) => String(unit.journey?.driverId || '') === normalizedDriverId)?.journey || null
  );
}

export function selectUnitForDriverJourney(
  units: readonly OperationalUnitSnapshot[],
  driverId: string | null | undefined
): OperationalUnitSnapshot | null {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return null;

  return units.find((unit) => String(unit.journey?.driverId || '') === normalizedDriverId) || null;
}
