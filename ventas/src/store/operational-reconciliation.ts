import type { OperationalUnitSnapshot } from '@shared/operational-contract';

function timestampMs(value?: string | null) {
  const parsed = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

export function operationalAuthority(unit: OperationalUnitSnapshot) {
  const receivedAt = timestampMs(unit.gps.receivedAt);
  if (receivedAt !== -Infinity) return receivedAt;
  const lastEventAt = timestampMs(unit.lastEventAt);
  return lastEventAt !== -Infinity ? lastEventAt : timestampMs(unit.gps.recordedAt);
}

export function preferNewestOperationalUnit(
  current: OperationalUnitSnapshot | undefined,
  incoming: OperationalUnitSnapshot
) {
  if (!current) return incoming;
  return operationalAuthority(current) > operationalAuthority(incoming) ? current : incoming;
}

export function reconcileOperationalSnapshot(
  current: OperationalUnitSnapshot[],
  incoming: OperationalUnitSnapshot[]
) {
  const currentById = new Map(current.map((unit) => [unit.unitId, unit]));
  return incoming.map((unit) => preferNewestOperationalUnit(currentById.get(unit.unitId), unit));
}

export function upsertOperationalUnit(current: OperationalUnitSnapshot[], incoming: OperationalUnitSnapshot) {
  const exists = current.some((unit) => unit.unitId === incoming.unitId);
  return exists
    ? current.map((unit) => unit.unitId === incoming.unitId ? preferNewestOperationalUnit(unit, incoming) : unit)
    : [...current, incoming];
}
