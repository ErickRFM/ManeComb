import { Pressable, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@/src/native/vector-icons';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { portalPalette } from '../../portal-theme';
import type { Vehicle } from '@/src/types/app';
import { getDriverName } from '../routes.utils';
import { styles } from '../routes.styles';

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
                    ● {vehicle.status === 'maintenance' ? 'Mantenimiento' : vehicle.assignedRoute ? 'En jornada' : 'Disponible'}
                  </Text>
                </>
              }
            />
          );
        })}
      </PortalDataList>
    </View>
  );
}
