const DEFAULT_ACTIVE_DAYS = [1, 2, 3, 4, 5, 6, 0];

function isValidTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "").trim());
}

function minutesFromTime(value) {
  const [hours, minutes] = String(value).split(":").map((part) => Number(part));
  return hours * 60 + minutes;
}

function normalizeActiveDays(days) {
  if (!Array.isArray(days)) {
    return DEFAULT_ACTIVE_DAYS;
  }

  const normalized = days
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);

  return Array.from(new Set(normalized));
}

function normalizeOperationalSchedule(schedule) {
  if (!schedule) {
    return null;
  }

  const startTime = String(schedule.startTime || "").trim();
  const endTime = String(schedule.endTime || "").trim();

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    throw new Error("Horario operativo invalido. Usa formato HH:mm.");
  }

  return {
    enabled: schedule.enabled !== false,
    startTime,
    endTime,
    activeDays: normalizeActiveDays(schedule.activeDays),
    timezone: String(schedule.timezone || "").trim() || null
  };
}

function getOperationalScheduleState(schedule, now = new Date()) {
  if (!schedule) {
    return {
      isConfigured: false,
      isWithinSchedule: true,
      reason: "not_configured"
    };
  }

  let normalized;
  try {
    normalized = normalizeOperationalSchedule(schedule);
  } catch {
    return {
      isConfigured: true,
      isWithinSchedule: false,
      reason: "invalid"
    };
  }

  if (!normalized.enabled) {
    return {
      isConfigured: true,
      isWithinSchedule: false,
      reason: "inactive"
    };
  }

  if (!normalized.activeDays.includes(now.getDay())) {
    return {
      isConfigured: true,
      isWithinSchedule: false,
      reason: "outside_day"
    };
  }

  const startMinutes = minutesFromTime(normalized.startTime);
  const endMinutes = minutesFromTime(normalized.endTime);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const isWithinSchedule =
    startMinutes === endMinutes
      ? true
      : startMinutes < endMinutes
        ? currentMinutes >= startMinutes && currentMinutes <= endMinutes
        : currentMinutes >= startMinutes || currentMinutes <= endMinutes;

  return {
    isConfigured: true,
    isWithinSchedule,
    reason: isWithinSchedule ? "within_schedule" : "outside_hours"
  };
}

module.exports = {
  DEFAULT_ACTIVE_DAYS,
  getOperationalScheduleState,
  normalizeOperationalSchedule
};
