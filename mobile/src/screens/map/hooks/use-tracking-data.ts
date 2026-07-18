import { useMemo } from 'react';
import type { OperationalUnitSnapshot } from '@shared/operational-contract';
import type { LiveLocationsData } from '@/src/types/app';
import {
  getActiveIncident,
  getActiveRouteCount,
  getMappableUnits,
  getPrioritizedUnits,
  getSelectedUnit,
  getUnitById,
  getVisibleIncidents,
  getVisibleUnits,
} from '../utils/tracking';

/**
 * Concentrador de datos del mapa.
 *
 * Toda la informacion operacional proviene del snapshot canonico. `mapData`
 * se conserva unicamente para la geometria de rutas y para las incidencias,
 * que no forman parte del contrato por unidad.
 */
export function useTrackingData(
  units: readonly OperationalUnitSnapshot[],
  mapData: LiveLocationsData | null,
  selectedUnitId: string | null,
  activeAlertIndex: number
) {
  // Inventario completo: incluye unidades sin GPS y sin ruta.
  const prioritizedUnits = useMemo(() => getPrioritizedUnits(getVisibleUnits(units)), [units]);
  const unitById = useMemo(() => getUnitById(prioritizedUnits), [prioritizedUnits]);

  // Subconjunto dibujable. No es un filtro de visibilidad: las unidades sin
  // coordenada siguen presentes en `prioritizedUnits` para listas y conteos.
  const mappableUnits = useMemo(() => getMappableUnits(prioritizedUnits), [prioritizedUnits]);

  // La seleccion recorre el inventario completo: una unidad sin GPS debe poder
  // seleccionarse y mostrar su ficha.
  const selectedUnit = useMemo(
    () => getSelectedUnit(selectedUnitId, prioritizedUnits, unitById),
    [prioritizedUnits, selectedUnitId, unitById]
  );

  const activeRouteCount = useMemo(() => getActiveRouteCount(prioritizedUnits), [prioritizedUnits]);

  const vehicleById = useMemo(
    () => new Map((mapData?.vehicles || []).map((vehicle) => [vehicle.id, vehicle])),
    [mapData?.vehicles]
  );
  const visibleIncidents = useMemo(
    () => getVisibleIncidents(mapData, vehicleById),
    [mapData, vehicleById]
  );
  const activeIncident = useMemo(
    () => getActiveIncident(visibleIncidents, activeAlertIndex),
    [activeAlertIndex, visibleIncidents]
  );
  const activeIncidentUnit = activeIncident ? unitById.get(activeIncident.vehicleId || '') || null : null;

  return {
    activeIncident,
    activeIncidentUnit,
    activeRouteCount,
    mappableUnits,
    prioritizedUnits,
    selectedUnit,
    unitById,
    vehicleById,
    visibleIncidents,
  };
}
