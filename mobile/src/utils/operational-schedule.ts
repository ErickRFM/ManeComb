import type { OperationalSchedule } from '@/src/types/app';

export const DEFAULT_ACTIVE_DAYS = [1, 2, 3, 4, 5, 6, 0];

type OperationalScheduleState = {
  isConfigured: boolean;
  isWithinSchedule: boolean;
  label: string;
  reason: 'not_configured' | 'inactive' | 'outside_day' | 'outside_hours';
};

function isValidTime(value: string | null | undefined) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(':').map((part) => Number(part));
  return hours * 60 + minutes;
}

function normalizeActiveDays(days: unknown) {
  if (!Array.isArray(days)) {
    return DEFAULT_ACTIVE_DAYS;
  }

  const normalized = days
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return Array.from(new Set(normalized));
}

export function normalizeOperationalSchedule(
  schedule: Partial<OperationalSchedule> | null | undefined
): OperationalSchedule | null {
  if (!schedule) {
    return null;
  }

  const startTime = String(schedule.startTime || '').trim();
  const endTime = String(schedule.endTime || '').trim();

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return null;
  }

  return {
    activeDays: normalizeActiveDays(schedule.activeDays),
    enabled: schedule.enabled !== false,
    endTime,
    startTime,
    timezone: String(schedule.timezone || '').trim() || null,
  };
}

export function getOperationalScheduleState(
  schedule: OperationalSchedule | null | undefined,
  now = new Date()
): OperationalScheduleState {
  const normalized = normalizeOperationalSchedule(schedule);

  if (!normalized) {
    return {
      isConfigured: false,
      isWithinSchedule: true,
      label: 'Sin horario configurado',
      reason: 'not_configured',
    };
  }

  if (!normalized.enabled) {
    return {
      isConfigured: true,
      isWithinSchedule: false,
      label: 'Horario inactivo',
      reason: 'inactive',
    };
  }

  if (!normalized.activeDays.includes(now.getDay())) {
    return {
      isConfigured: true,
      isWithinSchedule: false,
      label: 'Fuera de dia operativo',
      reason: 'outside_day',
    };
  }

  const startMinutes = minutesFromTime(normalized.startTime);
  const endMinutes = minutesFromTime(normalized.endTime);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const inWindow =
    startMinutes === endMinutes
      ? true
      : startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
        : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

  return {
    isConfigured: true,
    isWithinSchedule: inWindow,
    label: inWindow ? 'Dentro de horario' : 'Fuera de horario',
    reason: inWindow ? 'not_configured' : 'outside_hours',
  };
}

export function formatOperationalSchedule(schedule: OperationalSchedule | null | undefined) {
  const normalized = normalizeOperationalSchedule(schedule);

  if (!normalized) {
    return 'Sin horario configurado';
  }

  return `${normalized.startTime} - ${normalized.endTime}`;
}
