import type { OperationalSchedule } from '@/src/types/app';

export const DIRECTORY_SCHEDULE_DAY_OPTIONS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 0, label: 'Dom' },
] as const;

export type DriverScheduleDraft = {
  activeDays: number[];
  enabled: boolean;
  endTime: string;
  startTime: string;
  timezone: string | null;
};

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '18:00';
const MINUTES_PER_DAY = 24 * 60;

function isClockTime(value: string | null | undefined) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function clockToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesToClock(totalMinutes: number) {
  const normalized = ((totalMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeDays(days: number[] | null | undefined) {
  const requested = Array.isArray(days) ? days : [];
  const valid = requested.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  const unique = Array.from(new Set(valid));
  return unique.length ? unique : DIRECTORY_SCHEDULE_DAY_OPTIONS.map((day) => day.id);
}

export function createDriverScheduleDraft(
  schedule: OperationalSchedule | null | undefined
): DriverScheduleDraft {
  return {
    activeDays: normalizeDays(schedule?.activeDays),
    enabled: schedule?.enabled ?? true,
    endTime: isClockTime(schedule?.endTime) ? String(schedule?.endTime) : DEFAULT_END_TIME,
    startTime: isClockTime(schedule?.startTime) ? String(schedule?.startTime) : DEFAULT_START_TIME,
    timezone: String(schedule?.timezone || '').trim() || null,
  };
}

export function adjustDriverScheduleClock(value: string, deltaMinutes: number) {
  const safeValue = isClockTime(value) ? value : DEFAULT_START_TIME;
  return minutesToClock(clockToMinutes(safeValue) + deltaMinutes);
}

export function getDriverScheduleDurationMinutes(startTime: string, endTime: string) {
  if (!isClockTime(startTime) || !isClockTime(endTime)) return null;
  const start = clockToMinutes(startTime);
  const end = clockToMinutes(endTime);
  if (start === end) return MINUTES_PER_DAY;
  return end > start ? end - start : MINUTES_PER_DAY - start + end;
}

export function driverScheduleCrossesMidnight(startTime: string, endTime: string) {
  if (!isClockTime(startTime) || !isClockTime(endTime)) return false;
  return clockToMinutes(endTime) < clockToMinutes(startTime);
}

export function formatDriverScheduleDuration(minutes: number | null) {
  if (!minutes) return 'Sin duración';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!remainder) return `${hours} h`;
  if (!hours) return `${remainder} min`;
  return `${hours} h ${remainder} min`;
}

export function formatDriverScheduleDays(activeDays: number[]) {
  const selected = DIRECTORY_SCHEDULE_DAY_OPTIONS.filter((day) => activeDays.includes(day.id));
  const ids = selected.map((day) => day.id);
  const same = (expected: number[]) => expected.length === ids.length && expected.every((id, index) => id === ids[index]);

  if (same([1, 2, 3, 4, 5, 6, 0])) return 'Todos los días';
  if (same([1, 2, 3, 4, 5, 6])) return 'Lun–Sáb';
  if (same([1, 2, 3, 4, 5])) return 'Lun–Vie';
  return selected.map((day) => day.label).join(' · ') || 'Sin días';
}

export function formatDriverScheduleSummary(draft: DriverScheduleDraft) {
  const duration = formatDriverScheduleDuration(
    getDriverScheduleDurationMinutes(draft.startTime, draft.endTime)
  );
  const nextDay = driverScheduleCrossesMidnight(draft.startTime, draft.endTime)
    ? ' · termina al día siguiente'
    : draft.startTime === draft.endTime
      ? ' · ventana de 24 h'
      : '';
  return `${formatDriverScheduleDays(draft.activeDays)} · ${draft.startTime} → ${draft.endTime} · ${duration}${nextDay}`;
}

export function serializeDriverScheduleDraft(draft: DriverScheduleDraft): OperationalSchedule {
  return {
    activeDays: normalizeDays(draft.activeDays),
    enabled: draft.enabled,
    endTime: draft.endTime,
    startTime: draft.startTime,
    timezone: draft.timezone,
  };
}

export function driverScheduleDraftEquals(
  draft: DriverScheduleDraft,
  schedule: OperationalSchedule | null | undefined
) {
  if (!schedule) return false;
  const current = createDriverScheduleDraft(schedule);
  return (
    current.enabled === draft.enabled &&
    current.startTime === draft.startTime &&
    current.endTime === draft.endTime &&
    current.timezone === draft.timezone &&
    current.activeDays.length === draft.activeDays.length &&
    current.activeDays.every((day) => draft.activeDays.includes(day))
  );
}
