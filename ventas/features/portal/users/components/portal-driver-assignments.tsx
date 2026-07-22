import { Pressable, Text, View } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import type { User, Vehicle } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { styles } from '../users.styles';

export function PortalDriverAssignments({
  availableVehicles,
  drivers,
  isSubmitting,
  onAssign,
  vehicles,
}: {
  availableVehicles: Vehicle[];
  drivers: User[];
  isSubmitting: boolean;
  onAssign: (driverId: string, vehicleId: string | null) => void;
  vehicles: Vehicle[];
}) {
  return (
    <PortalSectionCard title="Asignacion de unidades" subtitle={`${drivers.length} conductores activados`}>
      {drivers.length ? (
        <PortalDataList>
          {drivers.map((driver) => {
            const driverVehicleOptions = availableVehicles.filter(
              (vehicle) => !vehicle.driverId || vehicle.driverId === driver.id || vehicle.id === driver.vehicleId
            );
            const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

            return (
              <PortalDataRow key={driver.id} body={<>
                  <Text style={[styles.userName, { color: palette.text }]}>{driver.name}</Text>
                  <Text style={[styles.userMeta, { color: palette.muted }]}>
                    {driver.email} / Unidad: {assignedVehicle?.code || 'Sin unidad'}
                  </Text>
                </>} actions={<View style={styles.assignmentOptions}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onAssign(driver.id, null)}
                    disabled={isSubmitting}
                    style={[
                      styles.assignmentChip,
                      {
                        backgroundColor: !driver.vehicleId ? palette.infoSoft : palette.surfaceAlt,
                        borderColor: !driver.vehicleId ? palette.info : palette.line,
                      },
                    ]}>
                    <Text style={[styles.assignmentText, { color: !driver.vehicleId ? palette.info : palette.text }]}>
                      Sin unidad
                    </Text>
                  </Pressable>
                  {driverVehicleOptions.map((vehicle) => (
                    <Pressable
                      key={vehicle.id}
                      accessibilityRole="button"
                      onPress={() => onAssign(driver.id, vehicle.id)}
                      disabled={isSubmitting}
                      style={[
                        styles.assignmentChip,
                        {
                          backgroundColor: driver.vehicleId === vehicle.id ? palette.successSoft : palette.surfaceAlt,
                          borderColor: driver.vehicleId === vehicle.id ? palette.success : palette.line,
                        },
                      ]}>
                      <Text style={[styles.assignmentText, { color: driver.vehicleId === vehicle.id ? palette.success : palette.text }]}>
                        {vehicle.code}
                      </Text>
                    </Pressable>
                  ))}
                </View>} />
            );
          })}
        </PortalDataList>
      ) : (
        <EmptyState
          icon="account-hard-hat-outline"
          title="Sin conductores activados"
          description="Genera una key de activacion para que el conductor cree su cuenta antes de asignarle unidad."
        />
      )}
    </PortalSectionCard>
  );
}
