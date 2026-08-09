import { Text, View } from 'react-native';
import { router } from '@/src/navigation/router';
import { palette } from '@/constants/theme';
import { EmptyState } from '@/src/components/ui/empty-state';
import { StatusBadge } from '@/src/components/ui/status-badge';
import type { User, Vehicle } from '@/src/types/app';
import { PortalSectionCard } from '../../cards';
import { PortalButton } from '../../components/portal-button';
import { PortalDataList, PortalDataRow } from '../../components/portal-data-list';
import { styles } from '../users.styles';

function formatLastAccess(value?: string | null) {
  if (!value) return 'Sin acceso registrado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin acceso registrado' : parsed.toLocaleString('es-MX');
}

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
    <PortalSectionCard title="Conductores" subtitle={`${drivers.length} perfiles vinculados a la empresa`}>
      {drivers.length ? (
        <PortalDataList>
          {drivers.map((driver) => {
            const assignedVehicle = vehicles.find((vehicle) => vehicle.id === driver.vehicleId);

            return (
              <PortalDataRow
                key={driver.id}
                body={
                  <View style={{ gap: 4 }}>
                    <Text style={[styles.userName, { color: palette.text }]}>{driver.name}</Text>
                    <Text style={[styles.userMeta, { color: palette.muted }]}>{driver.email}</Text>
                    <Text style={[styles.userMeta, { color: palette.muted }]}>Teléfono: {driver.phone || 'Sin teléfono'} · Turno: {driver.shift || 'Sin turno'}</Text>
                    <Text style={[styles.userMeta, { color: palette.muted }]}>Unidad: {assignedVehicle?.code || 'Sin unidad'} · Placas: {assignedVehicle?.plate || 'Sin placas'}</Text>
                    <Text style={[styles.userMeta, { color: palette.muted }]}>Último acceso: {formatLastAccess(driver.lastAccessAt)}</Text>
                  </View>
                }
                meta={
                  <StatusBadge
                    label={driver.userStatus === 'suspended' ? 'Dado de baja' : 'Activo'}
                    tone={driver.userStatus === 'suspended' ? 'warning' : 'positive'}
                  />
                }
                actions={
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    <PortalButton
                      icon="file-document-multiple-outline"
                      onPress={() => router.push('/portal/documentos' as never)}
                      size="sm"
                      variant="secondary">
                      Documentos
                    </PortalButton>
                    <PortalButton
                      disabled={isSubmitting}
                      icon="account-cog-outline"
                      onPress={() => onManage(driver)}
                      size="sm"
                      variant="secondary">
                      Administrar
                    </PortalButton>
                  </View>
                }
              />
            );
          })}
        </PortalDataList>
      ) : (
        <EmptyState
          icon="account-hard-hat-outline"
          title="Sin conductores activados"
          description="Genera una key de activación para que el conductor cree su cuenta y elija una unidad disponible de la empresa."
        />
      )}
    </PortalSectionCard>
  );
}
