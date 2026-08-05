import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import { sortByCriticality } from '@shared/operational-contract';
import type { Incident, LiveLocationsData, Vehicle } from '@/src/types/app';

/**
 * Frescura, estado y visibilidad ya vienen resueltos en el snapshot canonico.
 * Este modulo no vuelve a interpretarlos.
 *
 * Historico: aqui vivia ACTIVE_TRACKING_STATUSES, que exigia estado activo y
 * GPS fresco para dibujar una unidad. Ese filtro ocultaba del mapa las unidades
 * recien dadas de alta y las que perdian senal. Se elimino: una unidad visible
 * se dibuja siempre, atenuada segun `gps.freshness`.
 */

export function hasUnitPosition(unit: OperationalUnitSnapshot | null | undefined) {
  return Boolean(unit && unit.gps.lat !== null && unit.gps.lng !== null);
}

export function getPrioritizedUnits(units: readonly OperationalUnitSnapshot[] = []) {
  return sortByCriticality(units);
}

export function getUnitById(units: readonly OperationalUnitSnapshot[]) {
  return new Map(units.map((unit) => [unit.unitId, unit]));
}

export function getSelectedUnit(
  selectedUnitId: string | null,
  prioritizedUnits: OperationalUnitSnapshot[],
  unitById: Map<string, OperationalUnitSnapshot>
) {
  return selectedUnitId
    ? unitById.get(selectedUnitId) || prioritizedUnits[0] || null
    : prioritizedUnits[0] || null;
}

/**
 * Unidades que se dibujan en el mapa.
 *
 * Se incluyen las que no tienen GPS fresco e incluso las que nunca reportaron
 * posicion: el consumidor las representa atenuadas con su antiguedad, jamas
 * las omite. La unica exclusion legitima es no tener coordenada que dibujar.
 */
export function getMappableUnits(units: readonly OperationalUnitSnapshot[]) {
  return units.filter((unit) => unit.visibility === 'visible' && hasUnitPosition(unit));
}

/** Unidades del inventario, con o sin posicion. Para listas y conteos. */
export function getVisibleUnits(units: readonly OperationalUnitSnapshot[]) {
  return units.filter((unit) => unit.visibility === 'visible');
}

/**
 * Unidades de las que sabemos que circulan.
 * `unknown` no entra: no sumamos al contador algo que no nos consta.
 */
export function getActiveRouteCount(units: readonly OperationalUnitSnapshot[]) {
  return units.filter((unit) => unit.operationalState === 'on_route').length;
}

/** Unidades con ruta asignada pero sin dato de GPS que confirme su estado. */
export function getUnknownStateCount(units: readonly OperationalUnitSnapshot[]) {
  return units.filter((unit) => unit.operationalState === 'unknown').length;
}

function normalizeHudCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Presentacion compacta del estado operacional para el HUD.
 *
 * Antes se renderizaba `activas / desconocidas?` bajo la etiqueta "Rutas".
 * Ese slash parecia una relacion completadas/total (por ejemplo, 0/3), aunque
 * el segundo numero NO era el total: eran unidades sin estado confirmable.
 * Se devuelven dos indicadores independientes para que la UI no invente una
 * fraccion ni confunda catalogo de rutas con unidades actualmente en marcha.
 */
export function getTrackingHudRouteSummary(activeRouteCount: number, unknownStateCount: number) {
  return {
    active: {
      label: 'En ruta',
      value: String(normalizeHudCount(activeRouteCount)),
    },
    unknown: {
      label: 'Sin datos',
      value: String(normalizeHudCount(unknownStateCount)),
    },
  };
}

export function hasVehicleLiveLocation(vehicle: Vehicle | null | undefined) {
  return Boolean(
    vehicle?.locationTimestamp &&
    Number.isFinite(Number(vehicle.location?.latitude)) &&
    Number.isFinite(Number(vehicle.location?.longitude))
  );
}

export function getVisibleIncidents(mapData: LiveLocationsData | null, vehicleById: Map<string, Vehicle>) {
  if (!mapData) {
    return [];
  }

  return mapData.incidents.filter((incident) =>
    (typeof incident.vehicleId === 'string' && vehicleById.has(incident.vehicleId)) ||
    (
      Number.isFinite(Number(incident.location?.latitude)) &&
      Number.isFinite(Number(incident.location?.longitude))
    )
  );
}

export function getActiveIncident(incidents: Incident[], activeAlertIndex: number) {
  return incidents.length ? incidents[activeAlertIndex % incidents.length] : null;
}
