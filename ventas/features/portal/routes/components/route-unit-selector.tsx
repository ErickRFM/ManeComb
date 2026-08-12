import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { EmptyState } from '@/src/components/ui/empty-state';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import type { Vehicle } from '@/src/types/app';
import type { OperationalState } from '@shared/operational-contract';
import { getDriverName } from '../routes.utils';
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

function getSelectorStatusLabel(vehicle: Vehicle) {
  return (vehicle.operationalState && SELECTOR_STATUS_LABEL[vehicle.operationalState]) || 'Sin datos';
}

export function RouteUnitSelector({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
}: {
  vehicles: Vehicle[];
  selectedVehicleId: string;
  onSelectVehicle: (vehicleId: string) => void;
}) {
  return (
    <View style={styles.unitsPanel}>
      <View style={styles.panelHeading}>
        <Text style={styles.panelTitle}>Selecciona una unidad</Text>
        <Text style={styles.panelCount}>{vehicles.length}</Text>
      </View>
      {vehicles.length ? (
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
                      ● {getSelectorStatusLabel(vehicle)}
                    </Text>
                  </>
                }
              />
            );
          })}
        </PortalDataList>
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
