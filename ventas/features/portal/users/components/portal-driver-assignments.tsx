import { Text } from 'react-native';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { User, Vehicle } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { styles } from '../users.styles';

export function PortalDriverAssignments({
  drivers,
  isSubmitting,
  onManage,
  vehicles,
}: {
  drivers: User[];
  isSubmitting: boolean;
  onManage: (driver: User) => void;
  vehicles: Vehicle[];
}) {
  return (
    <PortalSectionCard title="Asignacion de unidades" subtitle={`${drivers.length} conductores activados`}>
      {drivers.length ? (
        <PortalDataList>
          {drivers.map((driver) => {
            const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

            return (
              <PortalDataRow key={driver.id} body={<>
                  <Text style={[styles.userName, { color: palette.text }]}>{driver.name}</Text>
                  <Text style={[styles.userMeta, { color: palette.muted }]}>
                    {driver.email} / Unidad: {assignedVehicle?.code || 'Sin unidad'}
                  </Text>
                </>}
                meta={<StatusBadge
                  label={driver.userStatus === 'suspended' ? 'Dado de baja' : 'Activo'}
                  tone={driver.userStatus === 'suspended' ? 'warning' : 'positive'}
                />}
                actions={<PortalButton
                  disabled={isSubmitting}
                  icon="account-cog-outline"
                  onPress={() => onManage(driver)}
                  size="sm"
                  variant="secondary">
                  Administrar
                </PortalButton>}
              />
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
