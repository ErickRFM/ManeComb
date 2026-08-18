import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { EmptyState } from '@/src/components/ui/empty-state';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import type { Vehicle } from '@/src/types/app';
import type { OperationalState, OperationalUnitSnapshot } from '@shared/operational-contract';
import { getDriverName } from '../routes.utils';
import { getRouteWorkspaceSizing } from '../routes.workspace-layout';
import { styles } from '../routes.styles';

// Mapeo de etiqueta PROPIO de este selector — NO es el `stateLabel` canónico del dashboard.
// Este es un selector para ASIGNAR ruta, no un monitor de estado: por eso `no_route` se
// rotula "Disponible" (la unidad está libre para asignar) en vez del canónico "Sin ruta".
// `maintenance` no aparece aquí: routeVehicles (portal-routes-screen:53) filtra las unidades
// en mantenimiento antes de que lleguen a este componente. `unknown` y las unidades sin
// snapshot (operationalState nulo) caen al fallback "Sin datos".
const SELECTOR_STATUS_LABEL: Partial<Record<OperationalState, string>> = {
  on_route: 'En ruta',
  stopped: 'Detenida',
  no_route: 'Disponible',
  unknown: 'Sin datos',
};

function getSelectorStatusLabel(unit?: OperationalUnitSnapshot) {
  return (unit?.operationalState && SELECTOR_STATUS_LABEL[unit.operationalState]) || 'Sin datos';
}

export function RouteUnitSelector({
  vehicles,
  operationalUnits,
  selectedVehicleId,
  onSelectVehicle,
}: {
  vehicles: Vehicle[];
  operationalUnits: OperationalUnitSnapshot[];
  selectedVehicleId: string;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  const { height, width } = useWindowDimensions();
  const workspace = getRouteWorkspaceSizing(width, height);
  const unitByVehicleId = new Map(operationalUnits.map((unit) => [unit.unitId, unit]));

  return (
    <View
      nativeID="route-unit-selector"
      style={[
        styles.unitsPanel,
        workspace.expanded
          ? { flexBasis: 190, flexGrow: 0, maxWidth: 210, minHeight: workspace.minHeight }
          : undefined,
      ]}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>Selecciona una unidad</Text>
        <Text style={styles.panelCount}>{vehicles.length}</Text>
      </View>
      {vehicles.length ? (
        <View
          {...(workspace.expanded ? ({ className: 'portal-scrollbar' } as any) : {})}
          style={workspace.expanded ? ({ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 2 } as any) : undefined}>
          <PortalDataList>
            {vehicles.map((vehicle) => {
              const active = selectedVehicleId === vehicle.id;
              return (
                <PortalDataRow
                  key={vehicle.id}
                  selected={active}
                  onPress={() => onSelectVehicle(vehicle.id)}
                  leading={
                    <View style={[styles.unitIcon, active ? styles.unitIconActive : undefined]}>
                      <MaterialCommunityIcons name="bus" size={20} color={active ? '#FFFFFF' : portalPalette.accent} />
                    </View>
                  }
                  body={
                    <>
                      <Text style={styles.unitCode}>{vehicle.code}</Text>
                      <Text numberOfLines={1} style={styles.unitDriver}>{getDriverName(vehicle)}</Text>
                      <Text style={styles.unitStatus}>
                        ● {getSelectorStatusLabel(unitByVehicleId.get(vehicle.id))}
                      </Text>
                    </>
                  }
                />
              );
            })}
          </PortalDataList>
        </View>
      ) : (
        <EmptyState
          icon="bus"
          title="Aún no hay unidades"
          description="Registra la primera unidad desde Gestión > Unidades para asignarle una ruta."
        />
      )}
    </View>
  );
}
